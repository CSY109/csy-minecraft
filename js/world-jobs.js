'use strict';

// The worker uses the same generation and meshing code, including offline file:// play.
// Serializing these definitions avoids a second copy of the terrain rules or imports
// from a Blob worker, which would be blocked by file-origin restrictions.
function worldWorkerSource() {
  const constants = { CS, CH, SEA, PW, PSTRIDE, B, T, BIOME, DIRS, CA, CB, AO_BR, ADJACENT, HORIZONTAL };
  const arrays = { TOP, BOT, SIDE, OCCL, SOLID, CROSS, LIQ, LBLOCK, LIGHT_EMISSION };
  const source = ['"use strict";'];
  for (const [name, value] of Object.entries(constants)) source.push('const ' + name + '=' + JSON.stringify(value) + ';');
  for (const [name, value] of Object.entries(arrays)) source.push('const ' + name + '=new Uint8Array(' + JSON.stringify(Array.from(value)) + ');');
  source.push('const GRAD3=new Float32Array(' + JSON.stringify(Array.from(GRAD3)) + ');');
  for (const fn of [mulberry32, hashInt, hash2, hash3, clamp, lerp, smoothstep]) {
    source.push('const ' + fn.name + '=' + fn.toString() + ';');
  }
  for (const fn of [SimplexNoise, FloatBuf, Chunk, BlockPhysics, BlockLighting, lightOpacity, World, classicBlockTile, generateNetherChunk, portalAt]) source.push(fn.toString());
  source.push('(' + runWorldWorker.toString() + ')();');
  return source.join('\n');
}
function runWorldWorker() {
  self.onmessage = ({ data }) => {
    try {
      const w = new World(data.seed, data.dimension);
      if (data.type === 'generate') {
        if (data.edits.length) w.edits.set(w.key(data.cx, data.cz), new Map(data.edits));
        const c = w.generate(data.cx, data.cz);
        self.postMessage({ id: data.id, blocks: c.blocks, hm: c.hm, maxY: c.maxY }, [c.blocks.buffer, c.hm.buffer]);
      } else {
        for (const input of data.chunks) {
          const c = new Chunk(input.cx, input.cz);
          Object.assign(c, input, { gen: true }); w.chunks.set(w.key(c.cx, c.cz), c);
        }
        w.physics.levels = new Map(data.levels);
        w.portals = data.portals;
        const mesh = w.meshChunk(w.getChunk(data.cx, data.cz));
        self.postMessage({ id: data.id, ...mesh }, [mesh.opaque.buffer, mesh.water.buffer, mesh.light.buffer]);
      }
    } catch (error) { self.postMessage({ id: data.id, error: String(error) }); }
  };
}

class WorldJobs {
  constructor() { this.worker = null; this.job = null; this.serial = 0; this.disabled = false; this.url = null; this.failure = ''; }
  available() {
    if (this.disabled) return false;
    if (this.worker) return true;
    try {
      this.url = URL.createObjectURL(new Blob([worldWorkerSource()], { type: 'application/javascript' }));
      this.worker = new Worker(this.url);
      this.worker.onmessage = ({ data }) => this.finish(data);
      this.worker.onerror = e => { e.preventDefault(); this.disable(e.message); };
      return true;
    } catch (error) { this.disable(String(error)); return false; }
  }
  disable(reason = '') {
    this.failure = reason;
    this.worker?.terminate(); this.worker = null; this.job = null; this.disabled = true;
    if (this.url) URL.revokeObjectURL(this.url); this.url = null;
  }
  send(w, type, cx, cz, payload, transfer = []) {
    if (!this.available() || this.job) return false;
    const c = w.getChunk(cx, cz), id = ++this.serial;
    this.job = { id, world: w, type, cx, cz, chunk: c, revision: c?.revision };
    try { this.worker.postMessage({ id, type, seed: w.seed, dimension: w.dimension, cx, cz, ...payload }, transfer); }
    catch (error) { this.disable(String(error)); return false; }
    return true;
  }
  generate(w, cx, cz) { return this.send(w, 'generate', cx, cz, { edits: Array.from(w.edits.get(w.key(cx, cz)) || []) }); }
  mesh(w, c) {
    const chunks = [], transfer = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = w.getChunk(c.cx + dx, c.cz + dz), blocks = n.blocks.slice(), hm = n.hm.slice();
      chunks.push({ cx: n.cx, cz: n.cz, blocks, hm, maxY: n.maxY }); transfer.push(blocks.buffer, hm.buffer);
    }
    const levels = [];
    for (const [key, value] of w.physics.levels) {
      const [x, , z] = key.split(',').map(Number);
      if (Math.abs((x >> 4) - c.cx) <= 1 && Math.abs((z >> 4) - c.cz) <= 1) levels.push([key, value]);
    }
    const portals = w.portals.map(({ x, y, z, axis, width, height, invalid }) => ({ x, y, z, axis, width, height, invalid }));
    return this.send(w, 'mesh', c.cx, c.cz, { chunks, levels, portals }, transfer);
  }
  finish(data) {
    const job = this.job;
    if (!job || data.id !== job.id) return;
    this.job = null;
    if (data.error) { this.disable(data.error); return; }
    if (world !== job.world) return;
    const w = job.world;
    if (job.type === 'generate') {
      if (w.getChunk(job.cx, job.cz)?.gen) return;
      const c = new Chunk(job.cx, job.cz);
      c.blocks = data.blocks; c.hm = data.hm; c.maxY = data.maxY; c.gen = true;
      // Edits may have changed while this chunk was being generated.
      const edits = w.edits.get(w.key(c.cx, c.cz));
      if (edits) for (const [index, id] of edits) { c.blocks[index] = id; if (id) c.maxY = Math.max(c.maxY, Math.floor(index / 256)); }
      w.chunks.set(w.key(c.cx, c.cz), c);
      if (edits) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) w.recalcHeight(c, x, z);
      w.physics.seedChunk(c);
    } else {
      const c = w.getChunk(job.cx, job.cz);
      if (c !== job.chunk || c.revision !== job.revision) return;
      uploadChunk(c, data); c.dirty = false; w.lighting.cache.set(c.cx + ',' + c.cz, data.light);
    }
  }
}
const worldJobs = new WorldJobs();
