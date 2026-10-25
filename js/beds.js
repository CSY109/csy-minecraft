'use strict';

let bedRespawn = null;
const sleeping = { active: false, elapsed: 0, bed: null, pose: null, wakeAt: 0 };
function bedStandingSpot(bed, allowTop = true) {
  const [dx, dz] = BED_DIRS[bed.dir], candidates = [];
  for (const [x, z] of [[bed.hx, bed.hz], [bed.x, bed.z]])
    for (const [sx, sz] of [[-dz, dx], [dz, -dx], [dx, dz], [-dx, -dz]]) candidates.push([x + sx + .5, bed.y + .001, z + sz + .5]);
  if (allowTop) candidates.push([bed.x + .5, bed.y + 9 / 16 + .001, bed.z + .5]);
  for (const p of candidates) {
    const x = Math.floor(p[0]), z = Math.floor(p[2]), below = world.getBlock(x, Math.floor(p[1] - .02), z);
    if (!SOLID[below] || below === B.MAGMA || below === B.CACTUS || collides(...p)) continue;
    const env = entityEnvironment(...p, HW * 2, PH);
    if (!env.lava && !env.fire && !env.water) return p;
  }
  return null;
}
function bedHasEnemies(bed) {
  return mobs.some(m => m.hp > 0 && MOB_TYPES[m.type].hostile && Math.abs(m.x - bed.hx - .5) <= 8 &&
    Math.abs(m.z - bed.hz - .5) <= 8 && Math.abs(m.y - bed.y) <= 5);
}
function placeBed() {
  if (!target || isSurvival() && !countItem(I.BED)) return true;
  let x = target.x + target.nx, y = target.y + target.ny, z = target.z + target.nz;
  if (CROSS[target.id]) { x = target.x; y = target.y; z = target.z; }
  const dir = ((Math.round(-player.yaw / (Math.PI / 2)) % 4) + 4) % 4, [dx, dz] = BED_DIRS[dir];
  if (y < 1 || y >= CH - 2) return true;
  for (const [xx, zz] of [[x, z], [x + dx, z + dz]]) {
    const id = world.getBlock(xx, y, zz), below = world.getBlock(xx, y - 1, zz);
    if (!world.getChunk(xx >> 4, zz >> 4)?.gen || id && !CROSS[id] || !SOLID[below] || isBedBlock(below)) { toast('床需要两格空地和下方支撑'); return true; }
    const intersects = (px, py, pz, r, h) => xx + 1 > px - r && xx < px + r && zz + 1 > pz - r && zz < pz + r && y + 9 / 16 > py && y < py + h;
    if (intersects(...player.p, HW, PH) || mobs.some(m => m.hp > 0 && intersects(m.x, m.y, m.z, MOB_TYPES[m.type].width / 2, MOB_TYPES[m.type].height))) return true;
  }
  world.setBlock(x, y, z, B.BED + dir); world.setBlock(x + dx, y, z + dz, B.BED + 4 + dir);
  spendItem(I.BED); mouseR = false; swing = 1; blockSound(B.PLANKS, .15, 'place'); queueGameSave(); return true;
}
function breakBed(x, y, z) {
  const id = world.getBlock(x, y, z);
  if (!isBedBlock(id)) return;
  spawnParticles(x, y, z, id); world.setBlock(x, y, z, B.AIR);
  if (isSurvival()) addItem(I.BED);
  blockSound(B.PLANKS, .2); swing = 1;
}
function useBed(hit) {
  mouseR = false;
  const bed = bedAt(world, hit.x, hit.y, hit.z); if (!bed) return;
  if (Math.min(Math.hypot(player.p[0] - bed.x - .5, player.p[1] - bed.y, player.p[2] - bed.z - .5),
    Math.hypot(player.p[0] - bed.hx - .5, player.p[1] - bed.y, player.p[2] - bed.hz - .5)) > 3) { toast('离床太远了'); return; }
  if (world.dimension !== 'overworld') {
    world.setBlock(bed.x, bed.y, bed.z, B.AIR);
    explodeArrow(bed.hx, bed.y, bed.hz, '床爆炸');
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const x = bed.hx + dx, z = bed.hz + dz;
      if ((dx + dz) % 2 === 0 && !world.getBlock(x, bed.y - 1, z) && SOLID[world.getBlock(x, bed.y - 2, z)]) world.setBlock(x, bed.y - 1, z, B.FIRE);
    }
    queueGameSave(); return;
  }
  if ([[bed.x, bed.z], [bed.hx, bed.hz]].some(([x, z]) => SOLID[world.getBlock(x, bed.y + 1, z)] || SOLID[world.getBlock(x, bed.y + 2, z)]) || !bedStandingSpot(bed)) {
    toast('床被阻挡了'); return;
  }
  const point = { x: bed.x, y: bed.y, z: bed.z, dir: bed.dir };
  const changed = JSON.stringify(bedRespawn) !== JSON.stringify(point); bedRespawn = point;
  if (changed) queueGameSave();
  const phase = ((gameTime / DAY_LEN) % 1 + 1) % 1;
  if (phase < .25 || phase >= .75) { toast('只能在夜晚睡觉，重生点已设置'); return; }
  if (isSurvival() && bedHasEnemies(bed)) { toast('附近有怪物，无法入睡'); return; }
  if (vitals.burnTime > 0) { toast('着火时无法入睡'); return; }
  sleeping.pose = { ...player, p: player.p.slice(), v: [0, 0, 0] }; sleeping.bed = bed; sleeping.elapsed = 0; sleeping.active = true;
  sleeping.wakeAt = (Math.floor(gameTime / DAY_LEN) + .77) * DAY_LEN;
  resetTouchInput(); resetMining(); player.fly = false; player.v = [0, 0, 0]; player.onGround = false;
  player.p = [bed.hx + .5, bed.y + 9 / 16 + .01, bed.hz + .5]; player.eyeH = .24;
  player.yaw = -(bed.dir * Math.PI / 2) + Math.PI; player.pitch = .08;
  document.body.classList.add('sleeping'); $('sleepOverlay').hidden = false; $('sleepShade').style.opacity = 0; updateTouchUI();
}
function standingSleepPlayer() {
  if (!sleeping.active) return player;
  return { ...sleeping.pose, p: bedStandingSpot(sleeping.bed) || sleeping.pose.p.slice(), v: [0, 0, 0], fly: false, onGround: false, eyeH: 1.62, sneak: false, sprint: false };
}
function endBedSleep(morning = false) {
  if (!sleeping.active) return;
  const pose = standingSleepPlayer(); sleeping.active = false;
  Object.assign(player, pose); vitals.fallTop = player.p[1];
  if (morning) {
    gameTime = Math.max(gameTime, sleeping.wakeAt);
    updateSky();
  }
  resetBedSleep(); resetTouchInput(); updateTouchUI(); queueGameSave();
}
function resetBedSleep() {
  sleeping.active = false; sleeping.bed = sleeping.pose = null; sleeping.elapsed = 0;
  document.body.classList.remove('sleeping'); $('sleepOverlay').hidden = true;
}
function updateBedSleep(dt) {
  if (!sleeping.active) return;
  const b = sleeping.bed, valid = bedAt(world, b.x, b.y, b.z);
  if (!valid || isSurvival() && bedHasEnemies(b)) { endBedSleep(); toast('睡眠被打断'); return; }
  sleeping.elapsed += dt; $('sleepShade').style.opacity = Math.min(.92, sleeping.elapsed / 5 * .92);
  if (sleeping.elapsed >= 5) endBedSleep(true);
}
function bedRespawnPosition() {
  if (!bedRespawn) return null;
  const b = bedRespawn;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) world.generate((b.x >> 4) + dx, (b.z >> 4) + dz);
  const bed = bedAt(world, b.x, b.y, b.z);
  const pos = bed && bed.dir === b.dir ? bedStandingSpot(bed) : null;
  if (!pos) { bedRespawn = null; toast('床已被破坏或阻挡，返回世界出生点'); }
  return pos;
}
$('leaveBed').onclick = () => endBedSleep();
