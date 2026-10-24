'use strict';
function generateNetherChunk(w, c) {
  const ox = c.cx * 16, oz = c.cz * 16, blocks = c.blocks;
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const wx = ox + x, wz = oz + z;
    const floor = Math.floor(29 + w.nCont.noise2D(wx * 0.022, wz * 0.022) * 13 + w.nDet.noise2D(wx * 0.07, wz * 0.07) * 4);
    const ceiling = Math.floor(76 + w.nMtn.noise2D(wx * 0.035, wz * 0.035) * 9);
    const soul = w.nHum.noise2D(wx * 0.055, wz * 0.055) > 0.24;
    for (let y = 0; y < CH; y++) {
      let id = 0;
      if (y <= 1 || y >= CH - 2) id = B.BEDROCK;
      else if (y <= floor || y >= ceiling) {
        id = B.NETHERRACK;
        const ore = hash3(wx >> 1, y >> 1, wz >> 1, w.seed);
        if (ore < 0.016) id = B.QUARTZ;
        if (y === floor && soul) id = B.SOUL_SAND;
        if (y === floor && floor <= 26 && hash2(wx, wz, w.seed) < 0.28) id = B.MAGMA;
      } else if (y <= 24) id = B.LAVA;
      else if (y < ceiling - 2 && y > floor + 2 && w.nCave.noise3D(wx * 0.045, y * 0.025, wz * 0.045) > 0.55) id = B.NETHERRACK;
      if (y < ceiling && y >= ceiling - 4 && hash2(wx >> 1, wz >> 1, w.seed ^ 773) < 0.075) id = B.GLOWSTONE;
      blocks[x + z * 16 + y * 256] = id;
    }
  }
  const edits = w.edits.get(w.key(c.cx, c.cz)); if (edits) for (const [index, id] of edits) blocks[index] = id;
  c.maxY = CH - 1;
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) w.recalcHeight(c, x, z);
  c.gen = true; w.physics.seedChunk(c); return c;
}
function portalCell(p, u, v) { return [p.x + (p.axis === 'x' ? u : 0), p.y + v, p.z + (p.axis === 'z' ? u : 0)]; }
function portalAt(w, x, y, z) {
  return w.portals.find(p => !p.invalid && y >= p.y && y < p.y + p.height && (p.axis === 'x' ? z === p.z && x >= p.x && x < p.x + p.width : x === p.x && z >= p.z && z < p.z + p.width));
}
function validPortalFrame(w, p) {
  for (let u = 0; u < p.width; u++) if (w.getBlock(...portalCell(p, u, -1)) !== B.OBSIDIAN || w.getBlock(...portalCell(p, u, p.height)) !== B.OBSIDIAN) return false;
  for (let v = 0; v < p.height; v++) if (w.getBlock(...portalCell(p, -1, v)) !== B.OBSIDIAN || w.getBlock(...portalCell(p, p.width, v)) !== B.OBSIDIAN) return false;
  return true;
}
function findPortalFrame(w, x, y, z, axis) {
  const empty = id => !id || id === B.PORTAL || !!CROSS[id], dx = axis === 'x' ? 1 : 0, dz = axis === 'z' ? 1 : 0;
  if (!empty(w.getBlock(x, y, z))) return null;
  let n = 0;
  while (y > 1 && empty(w.getBlock(x, y - 1, z)) && n++ < 21) y--;
  n = 0;
  while (empty(w.getBlock(x - dx, y, z - dz)) && n++ < 21) { x -= dx; z -= dz; }
  if (w.getBlock(x - dx, y, z - dz) !== B.OBSIDIAN) return null;
  let width = 0, height = 0;
  while (width <= 21 && empty(w.getBlock(x + dx * width, y, z + dz * width))) width++;
  while (height <= 21 && empty(w.getBlock(x, y + height, z))) height++;
  if (width < 2 || width > 21 || height < 3 || height > 21 || y + height >= CH) return null;
  const p = { x, y, z, axis, width, height, world: w, invalid: false, link: null };
  if (!validPortalFrame(w, p)) return null;
  for (let v = 0; v < height; v++) for (let u = 0; u < width; u++) if (!empty(w.getBlock(...portalCell(p, u, v)))) return null;
  return p;
}
function activatePortal(p) {
  const existing = portalAt(p.world, p.x, p.y, p.z); if (existing) return existing;
  p.world.portals.push(p);
  for (let v = 0; v < p.height; v++) for (let u = 0; u < p.width; u++) p.world.setBlock(...portalCell(p, u, v), B.PORTAL);
  gameSound('portal_ignite'); return p;
}
function ignitePortal(hit) {
  if (!hit) return false;
  const positions = [[hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz], [hit.x, hit.y + 1, hit.z], [hit.x + 1, hit.y, hit.z], [hit.x - 1, hit.y, hit.z], [hit.x, hit.y, hit.z + 1], [hit.x, hit.y, hit.z - 1]];
  for (const pos of positions) for (const axis of ['x', 'z']) {
    const frame = findPortalFrame(world, ...pos, axis); if (frame) { activatePortal(frame); return true; }
  }
  gameSound('flint'); return false;
}
function validatePortals(w) {
  if (!w.physics.portalsDirty) return;
  w.physics.portalsDirty = false;
  for (const p of w.portals) if (!p.invalid && (!validPortalFrame(w, p) || Array.from({ length: p.width * p.height }, (_, i) => w.getBlock(...portalCell(p, i % p.width, Math.floor(i / p.width)))).some(id => id !== B.PORTAL))) {
    p.invalid = true;
    for (let v = 0; v < p.height; v++) for (let u = 0; u < p.width; u++) if (w.getBlock(...portalCell(p, u, v)) === B.PORTAL) w.setBlock(...portalCell(p, u, v), B.AIR);
  }
}
const dimensionStates = new Map();
let portalCharge = 0, portalCooldown = 0;
function resetDimensions() { dimensionStates.clear(); dimensionStates.set(world.dimension, { world, mobs: [] }); portalCharge = portalCooldown = 0; }
function switchDimension(destination) {
  dimensionStates.set(world.dimension, { world, mobs: mobs.slice() });
  for (const c of world.chunks.values()) freeChunkMesh(c);
  world = destination;
  const saved = dimensionStates.get(destination.dimension);
  mobs.splice(0, mobs.length, ...(saved?.world === destination ? saved.mobs : []));
  projectiles.length = particles.length = 0; mouseL = mouseR = false; resetMining(); cancelBow();
  player.v = [0, 0, 0]; player.inWater = player.eyeWater = false; player.onGround = false;
  needed = []; lastCx = lastCz = 1e9; target = mobTarget = null; spawnClock = 0;
  hudStamp = ''; resetSoundscape();
}
function prepareArrival(w, source) {
  const scale = w.dimension === 'nether' ? 1 / 8 : 8, x = Math.floor(source.x * scale), z = Math.floor(source.z * scale);
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) w.generate((x >> 4) + dx, (z >> 4) + dz);
  const existing = w.portals.find(p => !p.invalid && Math.hypot(p.x - x, p.z - z) < 32 && validPortalFrame(w, p)); if (existing) return existing;
  let ground = w.surfaceY(x, z);
  if (w.dimension === 'nether') {
    ground = 38;
    for (let y = 55; y > 26; y--) if (SOLID[w.getBlock(x, y, z)] && !w.getBlock(x, y + 1, z) && !w.getBlock(x, y + 2, z)) { ground = y; break; }
  }
  const base = clamp(ground + 1, 4, CH - 8), p = { x: x - 1, y: base, z, axis: source.axis, width: 2, height: 3, world: w, invalid: false, link: null };
  for (let yy = base - 2; yy <= base + 4; yy++) for (let zz = z - 3; zz <= z + 3; zz++) for (let xx = x - 3; xx <= x + 3; xx++) w.setBlock(xx, yy, zz, yy < base ? w.dimension === 'nether' ? B.NETHERRACK : B.STONE : B.AIR);
  for (let u = -1; u <= p.width; u++) { w.setBlock(...portalCell(p, u, -1), B.OBSIDIAN); w.setBlock(...portalCell(p, u, p.height), B.OBSIDIAN); }
  for (let v = 0; v < p.height; v++) { w.setBlock(...portalCell(p, -1, v), B.OBSIDIAN); w.setBlock(...portalCell(p, p.width, v), B.OBSIDIAN); }
  return activatePortal(p);
}
function travelThroughPortal(p) {
  let arrival = p.link;
  if (arrival) validatePortals(arrival.world);
  if (!arrival || arrival.invalid || !validPortalFrame(arrival.world, arrival)) {
    const name = world.dimension === 'nether' ? 'overworld' : 'nether';
    const destination = dimensionStates.get(name)?.world || new World(world.seed, name);
    arrival = prepareArrival(destination, p); p.link = arrival; arrival.link = p;
  }
  switchDimension(arrival.world);
  player.p = arrival.axis === 'x' ? [arrival.x + arrival.width / 2, arrival.y + 0.02, arrival.z + 2] : [arrival.x + 2, arrival.y + 0.02, arrival.z + arrival.width / 2];
  player.yaw = arrival.axis === 'x' ? 0 : Math.PI / 2; player.pitch = 0; vitals.fallTop = player.p[1]; vitals.invulnerable = 3;
  portalCharge = 0; portalCooldown = 3; updateSky(); gameSound('portal_travel');
}
function updatePortals(dt) {
  validatePortals(world); portalCooldown = Math.max(0, portalCooldown - dt);
  const p = world.portals.find(p => !p.invalid && player.p[1] + PH > p.y && player.p[1] < p.y + p.height &&
    (p.axis === 'x' ? Math.abs(player.p[2] - p.z - 0.5) < 0.45 && player.p[0] >= p.x && player.p[0] <= p.x + p.width : Math.abs(player.p[0] - p.x - 0.5) < 0.45 && player.p[2] >= p.z && player.p[2] <= p.z + p.width));
  if (p && !portalCooldown) {
    if (!portalCharge) gameSound('portal_charge');
    portalCharge += dt;
    if (portalCharge >= (isSurvival() ? 4 : 0.2)) travelThroughPortal(p);
  } else { if (portalCharge) stopSound('portal_charge'); portalCharge = Math.max(0, portalCharge - dt * 2); }
  $('portalOverlay').style.opacity = Math.min(0.7, portalCharge / 4);
}
function returnToOverworld() {
  if (world.dimension !== 'nether') return;
  const destination = dimensionStates.get('overworld')?.world; if (destination) switchDimension(destination);
  portalCharge = 0; portalCooldown = 3; $('portalOverlay').style.opacity = 0;
}
function useWorldTool(id) {
  const action = ITEMS[id]?.action;
  if (action === 'ignite') {
    if (!ignitePortal(target) && target) {
      const x = target.x + target.nx, y = target.y + target.ny, z = target.z + target.nz;
      if (world.physics.loaded(x, y, z) && world.physics.replaceable(world.getBlock(x, y, z)) && SOLID[world.getBlock(x, y - 1, z)]) world.setBlock(x, y, z, B.FIRE);
    }
    swing = 1; return true;
  }
  if (action === 'bucket') {
    const e = eyePos(), d = lookDir();
    for (let t = 0; t < 5; t += 0.08) {
      const pos = e.map((n, a) => Math.floor(n + d[a] * t)), block = world.getBlock(...pos);
      if (LIQ[block] && world.physics.level(...pos) === 0) {
        world.setBlock(...pos, B.AIR);
        if (isSurvival()) { spendItem(id); addItem(block === B.WATER ? I.WATER_BUCKET : I.LAVA_BUCKET); hotbar[sel] = block === B.WATER ? I.WATER_BUCKET : I.LAVA_BUCKET; refreshHotbar(); }
        gameSound('bucket_fill'); return true;
      }
      if (SOLID[block]) break;
    }
    return true;
  }
  if (action === 'water' || action === 'lava') {
    if (!target) return true;
    const pos = [target.x + target.nx, target.y + target.ny, target.z + target.nz];
    if (!world.physics.loaded(...pos) || !world.physics.replaceable(world.getBlock(...pos))) return true;
    if (action === 'water' && world.dimension === 'nether') gameSound('fizz');
    else { world.setBlock(...pos, action === 'water' ? B.WATER : B.LAVA); gameSound('bucket_pour'); }
    if (isSurvival()) { spendItem(id); addItem(I.BUCKET); hotbar[sel] = I.BUCKET; refreshHotbar(); }
    swing = 1; return true;
  }
  return false;
}
