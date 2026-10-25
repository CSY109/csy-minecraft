'use strict';
const LIGHT_EMISSION = new Uint8Array(256);
LIGHT_EMISSION[B.TORCH] = 14;
for (const id of [B.GLOWSTONE, B.FIRE, B.LAVA]) LIGHT_EMISSION[id] = 15;
LIGHT_EMISSION[B.MAGMA] = 3; LIGHT_EMISSION[B.PORTAL] = 11;
function lightOpacity(id) { return SOLID[id] && !isBedBlock(id) && id !== B.GLASS && id !== B.LEAVES ? 15 : id === B.WATER || id === B.LEAVES ? 2 : 1; }

class BlockLighting {
  constructor(world) { this.world = world; this.cache = new Map(); this.field = null; }
  onEdit(x, y, z, before, after) {
    if (LIGHT_EMISSION[before] === LIGHT_EMISSION[after] && lightOpacity(before) === lightOpacity(after)) return;
    this.field = null;
    for (let cz = (z - 15) >> 4; cz <= (z + 15) >> 4; cz++) for (let cx = (x - 15) >> 4; cx <= (x + 15) >> 4; cx++) {
      const c = this.world.getChunk(cx, cz); this.cache.delete(cx + ',' + cz);
      if (c?.gen) { c.dirty = true; c.revision++; }
    }
  }
  sample(x, y, z) {
    if (y < 0 || y >= CH) return 0;
    return this.cache.get((x >> 4) + ',' + (z >> 4))?.[(x & 15) + (z & 15) * 16 + y * 256] || 0;
  }
  prepare(c) {
    const size = 48, plane = size * size, ox = (c.cx - 1) * 16, oz = (c.cz - 1) * 16;
    const blocks = new Uint8Array(plane * CH), values = new Uint8Array(blocks.length), buckets = Array.from({ length: 16 }, () => []);
    for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) {
      const n = this.world.getChunk(c.cx + dx - 1, c.cz + dz - 1); if (!n?.gen) continue;
      for (let y = 0; y < CH; y++) for (let z = 0; z < 16; z++)
        blocks.set(n.blocks.subarray(y * 256 + z * 16, y * 256 + z * 16 + 16), y * plane + (z + dz * 16) * size + dx * 16);
    }
    for (let i = 0; i < blocks.length; i++) {
      const emission = LIGHT_EMISSION[blocks[i]];
      if (emission) { values[i] = emission; buckets[emission].push(i); }
    }
    for (let level = 15; level > 1; level--) {
      const queue = buckets[level];
      for (let q = 0; q < queue.length; q++) {
        const i = queue[q]; if (values[i] !== level) continue;
        const x = i % size, z = Math.floor(i / size) % size, y = Math.floor(i / plane);
        for (const [dx, dy, dz] of ADJACENT) {
          if (x + dx < 0 || x + dx >= size || z + dz < 0 || z + dz >= size || y + dy < 0 || y + dy >= CH) continue;
          const j = i + dx + dz * size + dy * plane, next = level - lightOpacity(blocks[j]);
          if (next > values[j]) { values[j] = next; buckets[next].push(j); }
        }
      }
    }
    this.field = { ox, oz, values };
    const local = new Uint8Array(CS * CS * CH);
    for (let y = 0; y < CH; y++) for (let z = 0; z < 16; z++) local.set(values.subarray(y * plane + (z + 16) * size + 16, y * plane + (z + 16) * size + 32), y * 256 + z * 16);
    this.cache.set(c.cx + ',' + c.cz, local); return local;
  }
  at(x, y, z) {
    const f = this.field; if (!f || y < 0 || y >= CH) return 0;
    const xx = x - f.ox, zz = z - f.oz;
    return xx < 0 || xx >= 48 || zz < 0 || zz >= 48 ? 0 : f.values[xx + zz * 48 + y * 2304];
  }
}
