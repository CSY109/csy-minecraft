'use strict';
// ============================================================
//  World: terrain generation, chunk storage, mesher, raycast
// ============================================================

const CS = 16;          // chunk size (x,z)
const CH = 96;          // world height
const SEA = 32;         // sea level
const PW = CS + 2;      // padded width used by mesher
const PSTRIDE = PW * PW;

const BIOME = { PLAINS: 0, FOREST: 1, DESERT: 2, SNOW: 3 };

// Face table. u x v = n  => counter-clockwise when viewed from outside.
const DIRS = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], o: [1, 0, 1], shade: 0.80 },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], o: [0, 0, 0], shade: 0.80 },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], o: [0, 0, 1], shade: 0.66 },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], o: [1, 0, 0], shade: 0.66 },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], o: [0, 1, 1], shade: 1.00 },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], o: [0, 0, 0], shade: 0.50 },
];
const CA = [0, 1, 1, 0], CB = [0, 0, 1, 1];
const AO_BR = [0.42, 0.62, 0.82, 1.0];

class FloatBuf {
  constructor(n) { this.a = new Float32Array(n); this.n = 0; }
  reset() { this.n = 0; return this; }
  ensure(k) {
    if (this.n + k > this.a.length) {
      const b = new Float32Array(Math.max(this.a.length * 2, this.n + k));
      b.set(this.a); this.a = b;
    }
  }
  v(x, y, z, u, v, l, s, block = 0) {
    this.ensure(8);
    const a = this.a; let n = this.n;
    a[n++] = x; a[n++] = y; a[n++] = z; a[n++] = u; a[n++] = v; a[n++] = l; a[n++] = s; a[n++] = block;
    this.n = n;
  }
  take() { return this.a.slice(0, this.n); }
}

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.blocks = new Uint8Array(CS * CS * CH);
    this.hm = new Int16Array(CS * CS).fill(-1);
    this.gen = false;
    this.maxY = 0;
    this.mesh = null;
    this.dirty = false;
    this.revision = 0;
  }
}

class World {
  constructor(seed, dimension = 'overworld') {
    this.seed = seed | 0;
    this.dimension = dimension; this.portals = []; this.physics = new BlockPhysics(this);
    this.lighting = new BlockLighting(this);
    this.chunks = new Map();
    this.edits = new Map(); // Keep collected/placed blocks when a chunk streams out.
    this.nCont = new SimplexNoise(seed + 1);
    this.nDet = new SimplexNoise(seed + 2);
    this.nMtn = new SimplexNoise(seed + 3);
    this.nTemp = new SimplexNoise(seed + 4);
    this.nHum = new SimplexNoise(seed + 5);
    this.nCave = new SimplexNoise(seed + 6);
    this.nCave2 = new SimplexNoise(seed + 7);
    this.nCave3 = new SimplexNoise(seed + 8);
    this.pad = new Uint8Array(PSTRIDE * CH);
    this.hpad = new Int16Array(PSTRIDE);
    this.bufO = new FloatBuf(1 << 16);
    this.bufW = new FloatBuf(1 << 14);
    this._ext = { h: new Int16Array(22 * 22), b: new Uint8Array(22 * 22) };
  }

  key(cx, cz) { return cx + ',' + cz; }
  getChunk(cx, cz) { return this.chunks.get(cx + ',' + cz); }

  // ---------------- block access ----------------
  getBlock(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= CH) return 0;
    const c = this.chunks.get((x >> 4) + ',' + (z >> 4));
    if (!c || !c.gen) return 0;
    return c.blocks[(x & 15) + (z & 15) * 16 + y * 256];
  }

  setBlock(x, y, z, id, level = 0) {
    if (y < 0 || y >= CH) return;
    const cx = x >> 4, cz = z >> 4;
    const c = this.getChunk(cx, cz);
    if (!c || !c.gen) return;
    const lx = x & 15, lz = z & 15;
    const previous = c.blocks[lx + lz * 16 + y * 256];
    if (previous === id && (!LIQ[id] || this.physics.level(x, y, z) === level)) return;
    c.blocks[lx + lz * 16 + y * 256] = id;
    const key = this.key(cx, cz);
    if (!this.edits.has(key)) this.edits.set(key, new Map());
    this.edits.get(key).set(lx + lz * 16 + y * 256, id);
    if (id && y > c.maxY) c.maxY = y;
    this.recalcHeight(c, lx, lz);
    c.dirty = true; c.revision++;
    const mark = (dx, dz) => { const n = this.getChunk(cx + dx, cz + dz); if (n && n.gen) { n.dirty = true; n.revision++; } };
    if (lx === 0) mark(-1, 0);
    if (lx === 15) mark(1, 0);
    if (lz === 0) mark(0, -1);
    if (lz === 15) mark(0, 1);
    if (lx === 0 && lz === 0) mark(-1, -1);
    if (lx === 0 && lz === 15) mark(-1, 1);
    if (lx === 15 && lz === 0) mark(1, -1);
    if (lx === 15 && lz === 15) mark(1, 1);
    this.physics.onEdit(x, y, z, previous, id, level);
    this.lighting.onEdit(x, y, z, previous, id);
  }

  recalcHeight(c, lx, lz) {
    let y = Math.min(CH - 1, c.maxY);
    const b = c.blocks, i = lx + lz * 16;
    while (y >= 0 && !LBLOCK[b[i + y * 256]]) y--;
    c.hm[i] = y;
  }

  heightAt(x, z) {
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c || !c.gen) return -1;
    return c.hm[(x & 15) + (z & 15) * 16];
  }

  surfaceY(x, z) {
    for (let y = CH - 1; y >= 0; y--) if (SOLID[this.getBlock(x, y, z)]) return y;
    return -1;
  }

  // ---------------- terrain ----------------
  fbm(n, x, z, oct) {
    let a = 1, f = 1, s = 0, m = 0;
    for (let i = 0; i < oct; i++) { s += n.noise2D(x * f, z * f) * a; m += a; a *= 0.5; f *= 2; }
    return s / m;
  }

  terrainAt(wx, wz) {
    const cont = this.fbm(this.nCont, wx * 0.0018, wz * 0.0018, 3);
    const det = this.fbm(this.nDet, wx * 0.012, wz * 0.012, 4);
    const mt = this.fbm(this.nMtn, wx * 0.0035 + 50, wz * 0.0035, 4);
    const mtn = smoothstep(0.1, 0.5, mt);
    let h = 34 + cont * 22 + det * (3 + mtn * 12) + mtn * 34;
    h = clamp(Math.floor(h), 4, CH - 4);
    const temp = this.fbm(this.nTemp, wx * 0.0022, wz * 0.0022, 2);
    const hum = this.fbm(this.nHum, wx * 0.0025 + 300, wz * 0.0025 - 300, 2);
    let bio = BIOME.PLAINS;
    if (temp > 0.26 && hum < 0.12) bio = BIOME.DESERT;
    else if (temp < -0.28) bio = BIOME.SNOW;
    else if (hum > 0.08) bio = BIOME.FOREST;
    return [h, bio];
  }

  biomeAt(wx, wz) { return this.terrainAt(wx, wz)[1]; }

  generate(cx, cz) {
    let c = this.getChunk(cx, cz);
    if (!c) { c = new Chunk(cx, cz); this.chunks.set(this.key(cx, cz), c); }
    if (c.gen) return c;
    if (this.dimension === 'nether') return generateNetherChunk(this, c);
    const seed = this.seed;
    const blocks = c.blocks;
    const ox = cx * CS, oz = cz * CS;
    const rnd = mulberry32(hashInt(cx * 73856093 ^ cz * 19349663 ^ seed));

    // column info for the chunk + 3-wide border (for trees)
    const ext = this._ext;
    for (let z = -3; z < CS + 3; z++) for (let x = -3; x < CS + 3; x++) {
      const t = this.terrainAt(ox + x, oz + z);
      const i = (x + 3) + (z + 3) * 22;
      ext.h[i] = t[0]; ext.b[i] = t[1];
    }

    let maxY = 0;
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const wx = ox + x, wz = oz + z;
      const ei = (x + 3) + (z + 3) * 22;
      const h = ext.h[ei], bio = ext.b[ei];
      let top, fill, deep = B.STONE;
      if (h >= 86) { top = B.SNOW; fill = B.STONE; }
      else if (h >= 74) { top = B.STONE; fill = B.STONE; }
      else if (h <= SEA + 1) {
        const g = this.nDet.noise2D(wx * 0.06, wz * 0.06);
        top = (h < SEA - 2 && g > 0.35) ? B.GRAVEL : B.SAND; fill = top === B.GRAVEL ? B.GRAVEL : B.SAND;
        if (bio === BIOME.DESERT) { top = B.SAND; fill = B.SAND; }
      }
      else if (bio === BIOME.DESERT) { top = B.SAND; fill = B.SAND; deep = B.SANDSTONE; }
      else if (bio === BIOME.SNOW) { top = B.SNOWGRASS; fill = B.DIRT; }
      else { top = B.GRASS; fill = B.DIRT; }

      const base = x + z * 16;
      for (let y = 0; y <= h; y++) {
        let id;
        const depth = h - y;
        if (y === 0 || (y <= 3 && rnd() < 0.7 - y * 0.2)) id = B.BEDROCK;
        else if (depth === 0) id = top;
        else if (depth <= 3) id = fill;
        else if (deep === B.SANDSTONE && depth <= 7) id = B.SANDSTONE;
        else id = B.STONE;

        if (id !== B.BEDROCK && depth > 3 && y > 3) {
          const a = this.nCave.noise3D(wx * 0.032, y * 0.05, wz * 0.032);
          const b = this.nCave2.noise3D(wx * 0.032 + 100, y * 0.05 + 50, wz * 0.032 + 100);
          if (a * a + b * b < 0.011) id = 0;
          else if (y < 38) {
            const cc = this.nCave3.noise3D(wx * 0.014, y * 0.03, wz * 0.014);
            if (cc > 0.6) id = 0;
          }
        }
        blocks[base + y * 256] = id;
      }
      if (h < SEA) for (let y = h + 1; y <= SEA; y++) blocks[base + y * 256] = B.WATER;
      if (h > maxY) maxY = h;
      if (h < SEA && SEA > maxY) maxY = SEA;
    }

    // ores
    const vein = (id, count, ymin, ymax, size) => {
      for (let i = 0; i < count; i++) {
        let x = (rnd() * 16) | 0, y = ymin + ((rnd() * (ymax - ymin)) | 0), z = (rnd() * 16) | 0;
        const n = 2 + ((rnd() * size) | 0);
        for (let k = 0; k < n; k++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < CH) {
            const idx = x + z * 16 + y * 256;
            if (blocks[idx] === B.STONE) blocks[idx] = id;
          }
          x += ((rnd() * 3) | 0) - 1; y += ((rnd() * 3) | 0) - 1; z += ((rnd() * 3) | 0) - 1;
        }
      }
    };
    vein(B.COAL, 22, 4, 80, 6);
    vein(B.IRON, 14, 4, 52, 5);
    vein(B.GOLD, 7, 4, 28, 4);
    vein(B.DIAMOND, 4, 3, 17, 3);
    vein(B.CLAY, 5, 24, 38, 6);
    vein(B.OBSIDIAN, 3, 3, 12, 5);
    vein(B.MOSS, 4, 22, 45, 6);
    vein(B.GRAVEL, 5, 4, 60, 8);
    vein(B.DIRT, 6, 20, 70, 8);

    // trees & cacti (generated from a 3-block border so trees cross chunk edges)
    for (let tz = -3; tz < CS + 3; tz++) for (let tx = -3; tx < CS + 3; tx++) {
      const ei = (tx + 3) + (tz + 3) * 22;
      const h = ext.h[ei], bio = ext.b[ei];
      if (h <= SEA + 1 || h >= 72) continue;
      const wx = ox + tx, wz = oz + tz;
      const r = hash2(wx, wz, seed ^ 0x7777);
      if (bio === BIOME.FOREST || bio === BIOME.PLAINS) {
        const dens = bio === BIOME.FOREST ? 0.02 : 0.0016;
        if (r >= dens) continue;
        const th = 4 + ((hash2(wx, wz, seed ^ 0x1111) * 3) | 0);
        const topY = h + th;
        if (topY + 2 >= CH) continue;
        for (let ly = topY - 2; ly <= topY + 1; ly++) {
          const rad = ly >= topY ? 1 : 2;
          for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
            const lx = tx + dx, lz = tz + dz;
            if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
            const corner = Math.abs(dx) === rad && Math.abs(dz) === rad;
            if (corner && (ly === topY + 1 || rad === 1 || hash3(wx + dx, ly, wz + dz, seed) < 0.5)) continue;
            if (ly === topY + 1 && Math.abs(dx) + Math.abs(dz) > 1) continue;
            const idx = lx + lz * 16 + ly * 256;
            if (blocks[idx] === 0) blocks[idx] = B.LEAVES;
          }
        }
        if (tx >= 0 && tx < 16 && tz >= 0 && tz < 16) {
          for (let y = h + 1; y <= topY; y++) blocks[tx + tz * 16 + y * 256] = B.LOG;
          blocks[tx + tz * 16 + h * 256] = B.DIRT;
          if (topY > maxY) maxY = topY;
        }
        if (topY + 1 > maxY) maxY = topY + 1;
      } else if (bio === BIOME.DESERT && r < 0.0045) {
        if (tx < 0 || tx > 15 || tz < 0 || tz > 15) continue;
        if (blocks[tx + tz * 16 + h * 256] !== B.SAND) continue;
        const ch = 1 + ((hash2(wx, wz, seed ^ 0x2222) * 3) | 0);
        for (let y = h + 1; y <= h + ch; y++) blocks[tx + tz * 16 + y * 256] = B.CACTUS;
        if (h + ch > maxY) maxY = h + ch;
      }
    }

    // grass tufts and flowers
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const h = ext.h[(x + 3) + (z + 3) * 22];
      if (h <= SEA + 1 || h >= CH - 2) continue;
      const i = x + z * 16 + h * 256;
      if (blocks[i] !== B.GRASS || blocks[i + 256] !== 0) continue;
      const r = hash2(ox + x, oz + z, seed ^ 0x3333);
      const bio = ext.b[(x + 3) + (z + 3) * 22];
      const gd = bio === BIOME.FOREST ? 0.10 : 0.16;
      if (hash2(ox + x, oz + z, seed ^ 0x4545) < 0.003) blocks[i + 256] = B.PUMPKIN;
      else if (r < gd) blocks[i + 256] = B.TALLGRASS;
      else if (r < gd + 0.012) blocks[i + 256] = B.ROSE;
      else if (r < gd + 0.024) blocks[i + 256] = B.DANDELION;
      else continue;
      if (h + 1 > maxY) maxY = h + 1;
    }

    const edits = this.edits.get(this.key(cx, cz));
    if (edits) for (const [index, id] of edits) {
      blocks[index] = id;
      if (id) maxY = Math.max(maxY, Math.floor(index / 256));
    }
    c.maxY = Math.min(CH - 1, maxY + 1);
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) this.recalcHeight(c, x, z);
    c.gen = true;
    this.physics.seedChunk(c);
    return c;
  }

  // ---------------- meshing ----------------
  canMesh(c) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.getChunk(c.cx + dx, c.cz + dz);
      if (!n || !n.gen) return false;
    }
    return true;
  }

  buildPad(c) {
    const pad = this.pad, hp = this.hpad;
    const near = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) near.push(this.getChunk(c.cx + dx, c.cz + dz));
    pad.fill(0);
    for (let pz = 0; pz < PW; pz++) for (let px = 0; px < PW; px++) {
      const lx = px - 1, lz = pz - 1;
      const ox = lx < 0 ? -1 : lx > 15 ? 1 : 0, oz = lz < 0 ? -1 : lz > 15 ? 1 : 0;
      const n = near[(oz + 1) * 3 + (ox + 1)];
      const pi = px + pz * PW;
      if (!n || !n.gen) { hp[pi] = -1; continue; }
      const ci = (lx - ox * 16) + (lz - oz * 16) * 16;
      hp[pi] = n.hm[ci];
      const nb = n.blocks, top = Math.min(CH - 1, n.maxY + 1);
      for (let y = 0; y <= top; y++) pad[pi + y * PSTRIDE] = nb[ci + y * 256];
    }
  }

  meshChunk(c) {
    this.buildPad(c);
    const light = this.lighting.prepare(c), lightAt = (x, y, z) => this.lighting.at(c.cx * 16 + x, y, c.cz * 16 + z);
    const pad = this.pad, hp = this.hpad;
    const o = this.bufO.reset(), w = this.bufW.reset();
    const maxY = Math.min(CH - 1, c.maxY + 1);
    const EPS = 0.002;

    const occ = (px, py, pz) => py < 0 ? 1 : py >= CH ? 0 : OCCL[pad[px + pz * PW + py * PSTRIDE]];
    const sky = (px, py, pz) => (py >= CH || hp[px + pz * PW] < py) ? 1 : 0;
    const ao = [0, 0, 0, 0], sk = [0, 0, 0, 0];

    for (let y = 0; y <= maxY; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const px = x + 1, pz = z + 1;
      const base = px + pz * PW + y * PSTRIDE;
      const id = pad[base];
      if (!id) continue;
      if (id === B.PORTAL) {
        const portal = portalAt(this, c.cx * 16 + x, y, c.cz * 16 + z);
        const tile = T.PORTAL, tu = (tile & 15) / 16, tv = (tile >> 4) / 16;
        const points = portal?.axis === 'z' ? [[x + 0.5, y, z], [x + 0.5, y, z + 1], [x + 0.5, y + 1, z + 1], [x + 0.5, y + 1, z]] : [[x, y, z + 0.5], [x + 1, y, z + 0.5], [x + 1, y + 1, z + 0.5], [x, y + 1, z + 0.5]];
        for (const k of [0, 1, 2, 3]) w.v(...points[k], tu + (CA[k] ? 0.999 : 0.001) / 16, tv + (CB[k] ? 0.001 : 0.999) / 16, 1, 1, LIGHT_EMISSION[id]);
        continue;
      }

      if (CROSS[id]) {
        const tile = TOP[id];
        const tu = (tile & 15) / 16, tv = (tile >> 4) / 16, e = 1 / 16;
        const s = sky(px, y, pz);
        const x0 = x + 0.12, x1 = x + 0.88, z0 = z + 0.12, z1 = z + 0.88;
        const quad = (ax, az, bx, bz, rev) => {
          const P = [[ax, y, az, 0, 1], [bx, y, bz, 1, 1], [bx, y + 1, bz, 1, 0], [ax, y + 1, az, 0, 0]];
          if (rev) P.reverse();
          for (const q of P) o.v(q[0], q[1], q[2], tu + q[3] * e, tv + q[4] * e, 0.95, s, Math.max(LIGHT_EMISSION[id], lightAt(x, y, z)));
        };
        quad(x0, z0, x1, z1, false); quad(x0, z0, x1, z1, true);
        quad(x1, z0, x0, z1, false); quad(x1, z0, x0, z1, true);
        continue;
      }

      const liq = LIQ[id], occl = OCCL[id];
      const aboveWater = liq && y + 1 < CH && pad[base + PSTRIDE] === id;
      const fluidHeights = liq && !aboveWater ? [[0, 0], [1, 0], [1, 1], [0, 1]].map(([a, b]) => this.physics.cornerHeight(c.cx * 16 + x, y, c.cz * 16 + z, id, a, b)) : null;

      for (let d = 0; d < 6; d++) {
        const D = DIRS[d];
        const nx = px + D.n[0], ny = y + D.n[1], nz = pz + D.n[2];
        let nid;
        if (ny < 0) nid = B.BEDROCK; else if (ny >= CH) nid = 0; else nid = pad[nx + nz * PW + ny * PSTRIDE];
        if (liq) { if (nid === id || OCCL[nid]) continue; }
        else if (occl) { if (OCCL[nid]) continue; }
        else { if (nid === id || OCCL[nid]) continue; }

        const tile = classicBlockTile(id, d);
        const tu = (tile & 15) / 16, tv = (tile >> 4) / 16;
        const s0 = sky(nx, ny, nz);
        const un = D.u, vn = D.v;
        for (let k = 0; k < 4; k++) {
          const ua = CA[k] ? 1 : -1, vb = CB[k] ? 1 : -1;
          const ax = nx + un[0] * ua, ay = ny + un[1] * ua, az = nz + un[2] * ua;
          const bx = nx + vn[0] * vb, by = ny + vn[1] * vb, bz = nz + vn[2] * vb;
          const cx = ax + vn[0] * vb, cy = ay + vn[1] * vb, cz = az + vn[2] * vb;
          const o1 = occ(ax, ay, az), o2 = occ(bx, by, bz), o3 = occ(cx, cy, cz);
          if (occl) ao[k] = (o1 && o2) ? 0 : 3 - (o1 + o2 + o3); else ao[k] = 3;
          sk[k] = (s0 + (o1 ? s0 : sky(ax, ay, az)) + (o2 ? s0 : sky(bx, by, bz)) + (o3 ? s0 : sky(cx, cy, cz))) * 0.25;
        }
        const flip = ao[0] + ao[2] <= ao[1] + ao[3] ? 1 : 0;
        const buf = liq ? w : o;
        for (let m = 0; m < 4; m++) {
          const k = flip ? (m + 1) & 3 : m;
          const a = CA[k], b = CB[k];
          let vy = D.o[1] + un[1] * a + vn[1] * b;
          if (fluidHeights && vy > 0.5) {
            const vx = D.o[0] + un[0] * a + vn[0] * b, vz = D.o[2] + un[2] * a + vn[2] * b;
            vy = fluidHeights[vz ? vx ? 2 : 3 : vx ? 1 : 0];
          }
          buf.v(
            x + D.o[0] + un[0] * a + vn[0] * b,
            y + vy,
            z + D.o[2] + un[2] * a + vn[2] * b,
            tu + (a ? 1 - EPS : EPS) / 16,
            tv + (b ? EPS : 1 - EPS) / 16,
            D.shade * AO_BR[ao[k]],
            sk[k], Math.max(LIGHT_EMISSION[id], lightAt(x + D.n[0], y + D.n[1], z + D.n[2])));
        }
      }
    }
    return { opaque: o.take(), water: w.take(), light };
  }

  // ---------------- raycast (voxel DDA) ----------------
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tx = dx !== 0 ? ((dx > 0 ? x + 1 - ox : ox - x) * tdx) : Infinity;
    let ty = dy !== 0 ? ((dy > 0 ? y + 1 - oy : oy - y) * tdy) : Infinity;
    let tz = dz !== 0 ? ((dz > 0 ? z + 1 - oz : oz - z) * tdz) : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 100; i++) {
      const id = this.getBlock(x, y, z);
      if (id && !LIQ[id] && id !== B.PORTAL) return { x, y, z, nx, ny, nz, id, t };
      if (tx < ty && tx < tz) { t = tx; if (t > maxDist) return null; x += sx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { t = ty; if (t > maxDist) return null; y += sy; ty += tdy; nx = 0; ny = -sy; nz = 0; }
      else { t = tz; if (t > maxDist) return null; z += sz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }
}
