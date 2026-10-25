'use strict';
const ADJACENT = [[0, -1, 0], [0, 1, 0], [-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1]];
const HORIZONTAL = [[-1, 0], [1, 0], [0, -1], [0, 1]];
// A fixed 20 Hz clock and per-cell scheduled updates prevent queue-order waterfalls.
class BlockPhysics {
  constructor(w) {
    this.world = w; this.queue = new Map(); this.levels = new Map(); this.falling = [];
    this.clock = 0; this.tick = 0; this.portalsDirty = false; this.cornerCache = new Map();
    this.fireAges = new Map();
  }
  key(x, y, z) { return x + ',' + y + ',' + z; }
  loaded(x, y, z) { return y >= 0 && y < CH && !!this.world.getChunk(x >> 4, z >> 4)?.gen; }
  level(x, y, z) { return this.levels.get(this.key(x, y, z)) || 0; }
  gravity(id) { return id === B.SAND || id === B.GRAVEL; }
  delay(id) { return this.gravity(id) ? 2 : isBedBlock(id) ? 1 : id === B.FIRE ? 20 : id === B.TORCH ? 1 : id === B.LAVA ? this.world.dimension === 'nether' ? 10 : 30 : 5; }
  decay(id) { return id === B.LAVA && this.world.dimension !== 'nether' ? 2 : 1; }
  enqueue(x, y, z, delay = null) {
    if (!this.loaded(x, y, z)) return;
    const id = this.world.getBlock(x, y, z);
    if (!LIQ[id] && !this.gravity(id) && !isBedBlock(id) && id !== B.FIRE && id !== B.TORCH) return;
    if (this.gravity(id) && !this.canFallThrough(this.world.getBlock(x, y - 1, z))) {
      this.queue.delete(this.key(x, y, z)); return;
    }
    const key = this.key(x, y, z), due = this.tick + (delay ?? this.delay(id)), previous = this.queue.get(key);
    if (!previous || previous.due > due) this.queue.set(key, { x, y, z, due });
  }
  around(x, y, z) {
    this.enqueue(x, y, z);
    // Gravity depends on the cell directly below, never side or diagonal openings.
    this.enqueue(x, y + 1, z);
    for (const [dx, dy, dz] of ADJACENT) {
      if (dy === 1) continue;
      const other = this.world.getBlock(x + dx, y + dy, z + dz);
      if (LIQ[other] || other === B.FIRE) this.enqueue(x + dx, y + dy, z + dz);
    }
  }
  onEdit(x, y, z, previous, id, level) {
    if (previous !== id) this.queue.delete(this.key(x, y, z));
    if (id !== B.FIRE) this.fireAges.delete(this.key(x, y, z));
    if (LIQ[id] && level) this.levels.set(this.key(x, y, z), level); else this.levels.delete(this.key(x, y, z));
    this.cornerCache.clear(); this.around(x, y, z);
    if (previous === B.OBSIDIAN || previous === B.PORTAL) this.portalsDirty = true;
    if (LIQ[id]) for (const [dx, dy, dz] of ADJACENT) {
      const other = this.world.getBlock(x + dx, y + dy, z + dz);
      if (LIQ[other] && other !== id) this.enqueue(x + dx, y + dy, z + dz, 1);
    }
  }
  seedChunk(c) {
    const w = this.world; this.cornerCache.clear();
    for (let y = 1; y <= c.maxY; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const id = c.blocks[x + z * 16 + y * 256], wx = c.cx * 16 + x, wz = c.cz * 16 + z;
      if (this.gravity(id) && this.canFallThrough(w.getBlock(wx, y - 1, wz))) this.enqueue(wx, y, wz);
      if (id === B.TORCH || id === B.FIRE || isBedBlock(id)) this.enqueue(wx, y, wz);
      if (LIQ[id] && ADJACENT.some(([dx, dy, dz]) => dy !== 1 && this.loaded(wx + dx, y + dy, wz + dz) && this.replaceable(w.getBlock(wx + dx, y + dy, wz + dz)))) this.enqueue(wx, y, wz);
      if (!id && (x === 0 || x === 15 || z === 0 || z === 15)) for (const [dx, dz] of HORIZONTAL) if (LIQ[w.getBlock(wx + dx, y, wz + dz)]) this.enqueue(wx + dx, y, wz + dz);
    }
  }
  replaceable(id) { return id === B.AIR || !!CROSS[id]; }
  canFallThrough(id) { return id === B.AIR || !!LIQ[id] || !!CROSS[id]; }
  blocksFlow(id) { return !!SOLID[id] || id === B.PORTAL; }
  supported(x, y, z, id) {
    const below = this.world.getBlock(x, y - 1, z);
    return !!SOLID[below] || below === id && this.level(x, y - 1, z) === 0;
  }
  height(x, y, z) {
    const id = this.world.getBlock(x, y, z);
    if (this.world.getBlock(x, y + 1, z) === id) return 1;
    const level = this.level(x, y, z); return (8 - (level >= 8 ? 0 : level)) / 9;
  }
  cornerHeight(x, y, z, id, cx, cz) {
    const key = [x + cx, y, z + cz, id].join(',');
    if (this.cornerCache.has(key)) return this.cornerCache.get(key);
    let sum = 0, weights = 0;
    for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) {
      const xx = x + cx + dx, zz = z + cz + dz, neighbor = this.world.getBlock(xx, y, zz);
      if (this.world.getBlock(xx, y + 1, zz) === id) { this.cornerCache.set(key, 1); return 1; }
      if (neighbor === id) {
        const level = this.level(xx, y, zz), weight = level === 0 || level >= 8 ? 11 : 1;
        sum += this.height(xx, y, zz) * weight; weights += weight;
      } else if (!this.blocksFlow(neighbor)) weights++;
    }
    const result = weights ? sum / weights : this.height(x, y, z);
    if (this.cornerCache.size > 50000) this.cornerCache.clear();
    this.cornerCache.set(key, result); return result;
  }
  containsWater(px, py, pz) {
    const x = Math.floor(px), y = Math.floor(py), z = Math.floor(pz);
    if (this.world.getBlock(x, y, z) !== B.WATER) return false;
    const fx = px - x, fz = pz - z;
    const h0 = lerp(this.cornerHeight(x, y, z, B.WATER, 0, 0), this.cornerHeight(x, y, z, B.WATER, 1, 0), fx);
    const h1 = lerp(this.cornerHeight(x, y, z, B.WATER, 0, 1), this.cornerHeight(x, y, z, B.WATER, 1, 1), fx);
    return py < y + lerp(h0, h1, fz);
  }
  current(x, y, z) {
    const w = this.world;
    if (w.getBlock(x, y, z) !== B.WATER) return [0, 0, 0];
    const metadata = this.level(x, y, z), level = metadata >= 8 ? 0 : metadata;
    let vx = 0, vz = 0;
    for (const [dx, dz] of HORIZONTAL) {
      const xx = x + dx, zz = z + dz, id = w.getBlock(xx, y, zz);
      let difference = 0;
      if (id === B.WATER) { const n = this.level(xx, y, zz); difference = (n >= 8 ? 0 : n) - level; }
      else if (!this.blocksFlow(id) && w.getBlock(xx, y - 1, zz) === B.WATER) { const n = this.level(xx, y - 1, zz); difference = (n >= 8 ? 0 : n) - level + 8; }
      vx += dx * difference; vz += dz * difference;
    }
    const length = Math.hypot(vx, vz); if (length) { vx /= length; vz /= length; }
    const downward = metadata >= 8 && HORIZONTAL.some(([dx, dz]) => this.blocksFlow(w.getBlock(x + dx, y, z + dz)) || this.blocksFlow(w.getBlock(x + dx, y + 1, z + dz)));
    if (downward) { const norm = Math.hypot(vx, vz, 6); return [vx / norm, -6 / norm, vz / norm]; }
    return [vx, 0, vz];
  }
  pathOpen(x, y, z, id) {
    if (!this.loaded(x, y, z)) return false;
    const block = this.world.getBlock(x, y, z);
    return !this.blocksFlow(block) && (!LIQ[block] || block === id && this.level(x, y, z) > 0);
  }
  slopeDistance(x, y, z, id, maxDepth, avoidX, avoidZ) {
    const queue = [[x, z, 0]], visited = new Set([x + ',' + z, avoidX + ',' + avoidZ]);
    for (let index = 0; index < queue.length; index++) {
      const [xx, zz, distance] = queue[index];
      if (this.loaded(xx, y - 1, zz) && !this.blocksFlow(this.world.getBlock(xx, y - 1, zz))) return distance;
      if (distance >= maxDepth) continue;
      for (const [dx, dz] of HORIZONTAL) {
        const nx = xx + dx, nz = zz + dz, key = nx + ',' + nz;
        if (!visited.has(key) && this.pathOpen(nx, y, nz, id)) { visited.add(key); queue.push([nx, nz, distance + 1]); }
      }
    }
    return Infinity;
  }
  directions(x, y, z, id) {
    const candidates = []; let cheapest = Infinity;
    const search = id === B.LAVA && this.world.dimension !== 'nether' ? 2 : 4;
    for (const [dx, dz] of HORIZONTAL) {
      if (!this.pathOpen(x + dx, y, z + dz, id)) continue;
      const cost = this.slopeDistance(x + dx, y, z + dz, id, search, x, z);
      cheapest = Math.min(cheapest, cost); candidates.push({ dx, dz, cost });
    }
    return candidates.filter(candidate => candidate.cost === cheapest);
  }
  flowInto(x, y, z, id, level) {
    if (!this.loaded(x, y, z)) return false;
    const previous = this.world.getBlock(x, y, z);
    if (id === B.LAVA && previous === B.WATER) {
      this.world.setBlock(x, y, z, B.STONE); soundAt('fizz', [x, y, z], 0.13); return true;
    }
    if (!this.replaceable(previous)) return false;
    if (CROSS[previous]) addItem(blockDrop(previous));
    this.world.setBlock(x, y, z, id, level); return true;
  }
  flowCell(x, y, z, id) {
    const w = this.world, decay = this.decay(id);
    if (id === B.WATER && w.dimension === 'nether') { w.setBlock(x, y, z, B.AIR); return; }
    let level = this.level(x, y, z);
    if (id === B.LAVA && [...HORIZONTAL.map(([dx, dz]) => [dx, 0, dz]), [0, 1, 0]].some(([dx, dy, dz]) => w.getBlock(x + dx, y + dy, z + dz) === B.WATER)) {
      if (level === 0 || level <= 4) { w.setBlock(x, y, z, level === 0 ? B.OBSIDIAN : B.COBBLE); soundAt('fizz', [x, y, z], 0.13); return; }
    }
    if (level > 0) {
      let smallest = Infinity, sources = 0;
      for (const [dx, dz] of HORIZONTAL) if (w.getBlock(x + dx, y, z + dz) === id) {
        const neighbor = this.level(x + dx, y, z + dz); if (!neighbor) sources++;
        smallest = Math.min(smallest, neighbor >= 8 ? 0 : neighbor);
      }
      let incoming = smallest + decay; if (incoming >= 8) incoming = -1;
      if (w.getBlock(x, y + 1, z) === id) { const above = this.level(x, y + 1, z); incoming = above >= 8 ? above : above + 8; }
      if (id === B.WATER && sources >= 2 && this.supported(x, y, z, id)) incoming = 0;
      if (incoming !== level) {
        w.setBlock(x, y, z, incoming < 0 ? B.AIR : id, Math.max(0, incoming));
        if (incoming < 0) return;
        level = incoming;
      }
    }
    const below = w.getBlock(x, y - 1, z);
    if (this.flowInto(x, y - 1, z, id, level >= 8 ? level : level + 8)) return;
    if (level !== 0 && !this.blocksFlow(below)) return;
    const next = level >= 8 ? 1 : level + decay; if (next >= 8) return;
    for (const { dx, dz } of this.directions(x, y, z, id)) this.flowInto(x + dx, y, z + dz, id, next);
  }
  stepTick() {
    this.tick++;
    const due = [...this.queue.entries()].filter(([, entry]) => entry.due <= this.tick).sort((a, b) => a[1].due - b[1].due || a[1].y - b[1].y).slice(0, 2048);
    const eligible = new Set(due.filter(([, p]) => this.gravity(this.world.getBlock(p.x, p.y, p.z)) && this.canFallThrough(this.world.getBlock(p.x, p.y - 1, p.z))).map(([key]) => key));
    for (const [key, entry] of due) {
      if (this.queue.get(key) !== entry) continue;
      this.queue.delete(key); const { x, y, z } = entry;
      if (!this.loaded(x, y, z)) { this.queue.set(key, { ...entry, due: this.tick + 20 }); continue; }
      const id = this.world.getBlock(x, y, z);
      if (this.gravity(id)) {
        if (eligible.has(key) && this.canFallThrough(this.world.getBlock(x, y - 1, z)) && this.falling.length < 128) {
          this.falling.push({ x, y, z, id, vy: 0 }); this.world.setBlock(x, y, z, B.AIR);
        } else if (this.canFallThrough(this.world.getBlock(x, y - 1, z))) this.enqueue(x, y, z);
      } else if (isBedBlock(id)) {
        const bed = bedAt(this.world, x, y, z);
        if (bed === null) this.enqueue(x, y, z, 20);
        else if (!bed) { this.world.setBlock(x, y, z, B.AIR); addItem(I.BED); }
      } else if (id === B.TORCH) {
        if (!SOLID[this.world.getBlock(x, y - 1, z)] || isBedBlock(this.world.getBlock(x, y - 1, z))) { this.world.setBlock(x, y, z, B.AIR); addItem(B.TORCH); }
      } else if (id === B.FIRE) {
        const age = (this.fireAges.get(key) || 0) + 1;
        if (!SOLID[this.world.getBlock(x, y - 1, z)] || ADJACENT.some(([dx, dy, dz]) => this.world.getBlock(x + dx, y + dy, z + dz) === B.WATER) || age >= 12 && this.world.getBlock(x, y - 1, z) !== B.NETHERRACK)
          this.world.setBlock(x, y, z, B.AIR);
        else { this.fireAges.set(key, age); this.enqueue(x, y, z); }
      } else if (LIQ[id]) this.flowCell(x, y, z, id);
    }
    this.falling.sort((a, b) => a.y - b.y);
    for (let i = 0; i < this.falling.length;) {
      const m = this.falling[i];
      if (!this.loaded(m.x, Math.max(0, Math.floor(m.y)), m.z)) { i++; continue; }
      m.prevY = m.y;
      m.vy -= 0.8;
      const steps = Math.max(1, Math.ceil(Math.abs(m.vy * 0.05) / 0.1)); let landed = false;
      for (let n = 0; n < steps; n++) {
        const next = m.y + m.vy * 0.05 / steps;
        if (SOLID[this.world.getBlock(m.x, Math.floor(next), m.z)]) {
          const placeY = Math.floor(next) + 1;
          if (placeY < CH && !SOLID[this.world.getBlock(m.x, placeY, m.z)]) {
            const old = this.world.getBlock(m.x, placeY, m.z); if (CROSS[old]) addItem(blockDrop(old));
            this.world.setBlock(m.x, placeY, m.z, m.id); soundAt('sand_land', [m.x, placeY, m.z], 0.15); landed = true;
          } else { m.y = Math.max(m.y, placeY); m.vy = 0; }
          break;
        }
        m.y = next;
      }
      m.vy *= 0.98;
      if (landed) this.falling.splice(i, 1); else i++;
    }
  }
  update(dt) {
    this.clock += dt;
    let steps = 0;
    while (this.clock + 1e-9 >= 0.05 && steps++ < 20) { this.clock -= 0.05; this.stepTick(); }
  }
}

const fallingMeshes = new Map();
function drawFallingBlocks() {
  for (const m of world.physics.falling) {
    let mesh = fallingMeshes.get(m.id);
    if (!mesh) { mesh = buildBlockMesh(m.id); fallingMeshes.set(m.id, mesh); }
    const y = m.prevY === undefined ? m.y : lerp(m.prevY, m.y, clamp(world.physics.clock / 0.05, 0, 1));
    gl.uniform3f(progWorld.u.uOff, m.x, y, m.z); gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_INT, 0);
  }
}
