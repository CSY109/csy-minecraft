'use strict';

const MOB_TYPES = {
  pig: { name: '猪', hp: 10, speed: 1.15, width: 0.75, height: 0.95, color: [0.89, 0.55, 0.57], animal: true },
  cow: { name: '牛', hp: 14, speed: 0.95, width: 0.9, height: 1.4, color: [0.32, 0.23, 0.18], animal: true },
  sheep: { name: '羊', hp: 10, speed: 1.05, width: 0.8, height: 1.25, color: [0.88, 0.86, 0.79], animal: true },
  zombie: { name: '僵尸', hp: 20, speed: 1.65, width: 0.65, height: 1.85, color: [0.32, 0.52, 0.25], hostile: true, damage: 3 },
  spider: { name: '蜘蛛', hp: 16, speed: 2.3, width: 1.3, height: 0.7, color: [0.22, 0.17, 0.15], hostile: true, damage: 2 },
  creeper: { name: '苦力怕', hp: 16, speed: 1.45, width: 0.65, height: 1.7, color: [0.31, 0.65, 0.22], hostile: true, damage: 8 },
  iron_golem: { name: '铁傀儡', hp: 100, speed: 1.65, width: 1.25, height: 2.7, color: [0.79, 0.8, 0.73], golem: true, damage: 12 },
  snow_golem: { name: '雪傀儡', hp: 24, speed: 1.2, width: 0.8, height: 1.9, color: [0.94, 0.96, 0.97], golem: true, damage: 3 },
};
const mobs = [], projectiles = [];
let mobTarget = null, spawnClock = 0, combatClock = 0, mobSerial = 0;
function spawnMob(type, x, y, z) {
  const d = MOB_TYPES[type]; if (!d || mobs.length >= 48) return null;
  const mob = { type, x, y, z, hp: d.hp, vy: 0, yaw: Math.random() * Math.PI * 2, turn: 0,
    attack: 0, hurt: 0, flee: 0, sound: 4 + Math.random() * 10, walk: 0, grounded: false, fuse: 0, id: ++mobSerial };
  clearBurning(mob); mob.fallTop = y; mob.hazardClock = 0;
  mobs.push(mob); return mob;
}
function mobCollides(m, x, y, z) {
  const d = MOB_TYPES[m.type], r = d.width / 2;
  for (let yy = Math.floor(y); yy <= Math.floor(y + d.height - 0.001); yy++)
    for (let zz = Math.floor(z - r); zz <= Math.floor(z + r); zz++)
      for (let xx = Math.floor(x - r); xx <= Math.floor(x + r); xx++) {
        const id = world.getBlock(xx, yy, zz); if (SOLID[id] && y < yy + blockHeight(id) - 1e-5) return true;
      }
  return false;
}
function naturalSpawn(initial = false) {
  if (world.dimension === 'nether') return;
  const rng = initial ? mulberry32(world.seed ^ 27183) : Math.random;
  const desired = initial ? 8 : 2;
  for (let n = 0, successes = 0; n < 45 && successes < desired && mobs.length < 24; n++) {
    const a = rng() * Math.PI * 2, r = initial ? 7 + rng() * 18 : 18 + rng() * 28;
    const x = Math.floor(player.p[0] + Math.cos(a) * r), z = Math.floor(player.p[2] + Math.sin(a) * r);
    if (!world.getChunk(x >> 4, z >> 4)?.gen) continue;
    const y = world.surfaceY(x, z), block = world.getBlock(x, y, z);
    if (y <= SEA || y > CH - 4 || [B.LOG, B.LEAVES, B.CACTUS].includes(block) || LIQ[world.getBlock(x, y + 1, z)]) continue;
    const hostile = !initial && sky.d < 0.3;
    const type = (hostile ? ['zombie', 'spider', 'creeper'] : ['pig', 'cow', 'sheep'])[(rng() * 3) | 0];
    if (!hostile && mobs.filter(m => MOB_TYPES[m.type].animal).length >= 12) continue;
    const probe = { type };
    if (mobCollides(probe, x + 0.5, y + 1.02, z + 0.5)) continue;
    if (mobs.some(m => Math.hypot(m.x - x, m.z - z) < 2)) continue;
    spawnMob(type, x + 0.5, y + 1.02, z + 0.5); successes++;
  }
}
function damageMob(m, amount, source = null) {
  if (m.hp <= 0) return;
  m.hp = Math.max(0, m.hp - amount); m.hurt = 0.25; m.flee = 3;
  soundAt(decodedSounds[m.type + '_hurt'] ? m.type + '_hurt' : m.type, [m.x, m.y, m.z], 0.16);
  hudStamp = '';
  if (source) { m.yaw = Math.atan2(m.x - source[0], m.z - source[2]); m.vy = 2.5; }
  if (m.hp <= 0) {
    m.dying = true; m.deathTime = 0; m.walk = 0; m.fuse = 0;
    if (MOB_TYPES[m.type].animal) { addItem(I.MEAT, 2); if (m.type === 'sheep') addItem(B.WOOL, 2); }
    else if (m.type === 'spider') addItem(I.STRING, 2);
    else if (m.type === 'zombie') addItem(Math.random() < 0.25 ? I.RAW_IRON : I.COAL, 1);
    else if (m.type === 'iron_golem') addItem(I.INGOT, 3);
    else if (m.type === 'snow_golem') addItem(B.SNOW, 1);
    else if (m.type === 'creeper') addItem(I.GUNPOWDER, 1 + (Math.random() < 0.5 ? 1 : 0));
  }
}
function rayBox(origin, dir, min, max, reach) {
  let near = 0, far = reach;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(dir[a]) < 1e-8) { if (origin[a] < min[a] || origin[a] > max[a]) return null; continue; }
    const t1 = (min[a] - origin[a]) / dir[a], t2 = (max[a] - origin[a]) / dir[a];
    near = Math.max(near, Math.min(t1, t2)); far = Math.min(far, Math.max(t1, t2));
    if (near > far) return null;
  }
  return near;
}
function findMobTarget(origin, dir, reach = 4.5, blockDistance = Infinity, excluded = null) {
  let result = null, closest = Math.min(reach, blockDistance);
  for (const mob of mobs) {
    if (mob.hp <= 0 || mob === excluded) continue;
    const d = MOB_TYPES[mob.type], r = d.width / 2;
    const t = rayBox(origin, dir, [mob.x - r, mob.y, mob.z - r], [mob.x + r, mob.y + d.height, mob.z + r], closest);
    if (t !== null && t <= closest) { closest = t; result = { mob, distance: t }; }
  }
  return result;
}
function attackMob() {
  if (combatClock > 0 || !mobTarget) return;
  const held = hotbar[sel];
  if (isSurvival() && held && !countItem(held)) return;
  const item = ITEMS[held]; combatClock = item?.tool === 'sword' ? 0.4 : 0.65;
  damageMob(mobTarget.mob, item?.damage || 1, player.p); gameSound(item?.tool === 'sword' ? 'sword' : 'attack'); swing = 1;
}
function hasSight(from, to) {
  const delta = to.map((n, a) => n - from[a]), dist = Math.hypot(...delta);
  return !dist || !world.raycast(...from, ...delta.map(n => n / dist), dist);
}
function shootProjectile(origin, direction, type, owner, damage, speed = type === 'snowball' ? 13 : 25) {
  projectiles.push({ p: origin.slice(), v: direction.map(v => v * speed), type, owner, damage, life: 4 });
}
function mobDeathAngle(m) { return m.dying ? Math.min(1, Math.sqrt(m.deathTime / 0.55)) * Math.PI / 2 : 0; }
function updateMobDeath(m, dt) {
  m.deathTime += dt; m.hurt = Math.max(0, m.hurt - dt);
  m.vy = Math.max(-20, m.vy - 20 * dt);
  const y = m.y + m.vy * dt;
  if (!mobCollides(m, m.x, y, m.z)) m.y = y;
  else m.vy = 0;
  if (m.deathTime < 1) return false;
  // Soft white puffs replace the body once it has finished rolling onto its side.
  for (let n = 0; n < 18; n++) particles.push({
    x: m.x + (Math.random() - 0.5) * 0.9, y: m.y + 0.25 + Math.random() * 0.65,
    z: m.z + (Math.random() - 0.5) * 0.9, vx: (Math.random() - 0.5) * 0.7,
    vy: 0.4 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 0.7,
    gravity: -0.2, life: 0.4 + Math.random() * 0.35, size: 0.09 + Math.random() * 0.06,
    u: ((T.SNOW & 15) + 0.5) / 16, v: ((T.SNOW >> 4) + 0.5) / 16,
  });
  return true;
}
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i]; p.life -= dt;
    if (p.life <= 0) { projectiles.splice(i, 1); continue; }
    p.v[1] -= (p.type === 'snowball' ? 3 : 7) * dt;
    const delta = p.v.map(v => v * dt), distance = Math.hypot(...delta), dir = delta.map(v => v / (distance || 1));
    const block = world.raycast(...p.p, ...dir, distance);
    const hit = findMobTarget(p.p, dir, distance, block ? block.t : distance, p.owner);
    if ((hit || block) && p.type === 'explosive_arrow') {
      const center = hit ? p.p.map((n, a) => Math.floor(n + dir[a] * hit.distance)) : [block.x, block.y, block.z];
      explodeArrow(...center); p.life = 0;
    }
    else if (hit) { damageMob(hit.mob, p.damage, p.p); p.life = 0; gameSound('arrow_hit', 0.12); }
    else if (block) p.life = 0;
    else for (let a = 0; a < 3; a++) p.p[a] += delta[a];
    if (p.life <= 0) projectiles.splice(i, 1);
  }
}
function explodeArrow(cx, cy, cz, cause = '爆炸箭') {
  const min = [cx - 2, cy - 2, cz - 2], max = [cx + 3, cy + 3, cz + 3];
  const intersects = (a, b) => a.every((v, i) => v < max[i] && b[i] > min[i]);
  // One fixed 20-point blast; the direct hit does not add a second damage event.
  for (const m of mobs) {
    const d = MOB_TYPES[m.type], r = d.width / 2;
    if (m.hp > 0 && intersects([m.x - r, m.y, m.z - r], [m.x + r, m.y + d.height, m.z + r]))
      damageMob(m, 20, [cx + 0.5, cy + 0.5, cz + 0.5]);
  }
  if (intersects([player.p[0] - HW, player.p[1], player.p[2] - HW], [player.p[0] + HW, player.p[1] + PH, player.p[2] + HW]))
    damagePlayer(20, cause);
  for (let y = cy - 2; y <= cy + 2; y++) for (let z = cz - 2; z <= cz + 2; z++) for (let x = cx - 2; x <= cx + 2; x++) {
    const id = world.getBlock(x, y, z);
    if (!id || LIQ[id] || [B.BEDROCK, B.OBSIDIAN, B.PORTAL].includes(id)) continue;
    if ((x + y + z) % 5 === 0) spawnBlockChips({ x, y, z, id, ny: 1 }, 2, true);
    world.setBlock(x, y, z, B.AIR);
  }
  for (let n = 0; n < 60; n++) {
    const smoke = n >= 24, tile = smoke ? EXPLOSION_TILES.smoke : EXPLOSION_TILES.fire;
    const vx = (Math.random() - 0.5) * 8, vy = (Math.random() - 0.25) * 6, vz = (Math.random() - 0.5) * 8;
    particles.push({ x: cx + 0.5 + vx * 0.16, y: cy + 0.5 + vy * 0.16, z: cz + 0.5 + vz * 0.16,
      vx: vx * (smoke ? 0.3 : 1), vy: smoke ? 0.8 + Math.random() : vy, vz: vz * (smoke ? 0.3 : 1),
      gravity: smoke ? -0.2 : 3, size: smoke ? 0.25 + Math.random() * 0.25 : 0.12 + Math.random() * 0.18,
      life: smoke ? 0.6 + Math.random() * 0.4 : 0.2 + Math.random() * 0.25,
      u: ((tile & 15) + 0.25) / 16, v: ((tile >> 4) + 0.25) / 16 });
  }
  gameSound('explode', 0.3);
}
function explodeCreeper(m) {
  gameSound('explode', 0.25); m.hp = 0;
  const dist = Math.hypot(player.p[0] - m.x, player.p[1] - m.y, player.p[2] - m.z);
  if (dist < 4.5) damagePlayer(Math.ceil((4.5 - dist) * 4), '苦力怕爆炸');
  for (const other of mobs) if (other !== m && Math.hypot(other.x - m.x, other.y - m.y, other.z - m.z) < 4) damageMob(other, 14);
  const [cx, cy, cz] = [m.x, m.y + 0.7, m.z].map(Math.floor);
  for (let y = cy - 2; y <= cy + 2; y++) for (let z = cz - 2; z <= cz + 2; z++) for (let x = cx - 2; x <= cx + 2; x++) {
    const id = world.getBlock(x, y, z);
    if (id && y >= 1 && Math.hypot(x - cx, y - cy, z - cz) <= 2.3 && (BLOCK_INFO[id]?.hardness || Infinity) < 6) world.setBlock(x, y, z, 0);
  }
  spawnParticles(cx, cy, cz, B.STONE);
}
function updateMobs(dt) {
  combatClock = Math.max(0, combatClock - dt);
  spawnClock += dt;
  if (spawnClock > 8) { spawnClock = 0; naturalSpawn(); }
  for (let index = mobs.length - 1; index >= 0; index--) {
    const m = mobs[index], d = MOB_TYPES[m.type], playerDist = Math.hypot(m.x - player.p[0], m.z - player.p[2]);
    if (m.y < -10 || playerDist > (renderDist + 2) * 16 && !d.golem) { mobs.splice(index, 1); continue; }
    if (m.hp <= 0) { if (!m.dying || updateMobDeath(m, dt)) mobs.splice(index, 1); continue; }
    if (!world.getChunk(Math.floor(m.x) >> 4, Math.floor(m.z) >> 4)?.gen) continue;
    m.attack -= dt; m.hurt = Math.max(0, m.hurt - dt); m.flee = Math.max(0, m.flee - dt); m.turn -= dt; m.sound -= dt;
    if (m.sound < 0 && playerDist < 18) { soundAt(m.type, [m.x, m.y, m.z], 0.15); m.sound = 6 + Math.random() * 12; }
    let aim = null, targetMob = null, chasingPlayer = false;
    if (d.golem || d.hostile) {
      let nearest = d.golem ? 18 : 15;
      for (const other of mobs) {
        if (other === m || other.hp <= 0 || !(d.golem ? MOB_TYPES[other.type].hostile : MOB_TYPES[other.type].golem)) continue;
        const dist = Math.hypot(other.x - m.x, other.y - m.y, other.z - m.z);
        if (dist < nearest) { nearest = dist; targetMob = other; aim = [other.x, other.y, other.z]; }
      }
      if (d.hostile && isSurvival() && !dead && playerDist < nearest && Math.abs(m.y - player.p[1]) < 8) { aim = player.p; targetMob = null; chasingPlayer = true; }
    }
    let speed = d.speed;
    if (aim) {
      const dx = aim[0] - m.x, dz = aim[2] - m.z, distance = Math.hypot(dx, dz);
      m.yaw = Math.atan2(dx, dz);
      const reach = m.type === 'iron_golem' ? 2.3 : 1.5;
      if (m.type === 'snow_golem' && distance < 13) {
        speed = distance < 7 ? 0 : speed;
        const origin = [m.x, m.y + 1.5, m.z], destination = [aim[0], aim[1] + 0.8, aim[2]];
        if (m.attack <= 0 && hasSight(origin, destination)) {
          const v = destination.map((n, a) => n - origin[a]), len = Math.hypot(...v); v[1] += distance * 0.08;
          const norm = Math.hypot(...v); shootProjectile(origin, v.map(n => n / (norm || len || 1)), 'snowball', m, d.damage);
          m.attack = 1.2; gameSound('bow', 0.04);
        }
      } else if (distance < reach && Math.abs(aim[1] - m.y) < 2) {
        speed = 0;
        const canHit = hasSight([m.x, m.y + d.height * 0.6, m.z], [aim[0], aim[1] + 0.8, aim[2]]);
        if (canHit && m.type === 'creeper') {
          if (m.fuse === 0) gameSound('creeper');
          m.fuse += dt; if (m.fuse > 1.5) { explodeCreeper(m); continue; }
        } else if (canHit && m.attack <= 0) {
          if (chasingPlayer) damagePlayer(d.damage, d.name + '攻击');
          else if (targetMob) damageMob(targetMob, d.damage, [m.x, m.y, m.z]);
          m.attack = d.golem ? 1 : 1.25;
        }
      } else m.fuse = Math.max(0, m.fuse - dt * 2);
    } else {
      m.fuse = Math.max(0, m.fuse - dt * 2);
      if (m.turn <= 0) { m.yaw += (Math.random() - 0.5) * 2.4; m.turn = 2 + Math.random() * 3; }
      if (d.animal && hotbar[sel] === I.APPLE && (!isSurvival() || countItem(I.APPLE)) && playerDist < 10 && m.flee <= 0) { m.yaw = Math.atan2(player.p[0] - m.x, player.p[2] - m.z); speed *= playerDist < 2 ? 0 : 1; }
      else speed *= m.flee > 0 ? 2.2 : m.turn > 3 ? 0 : 0.45;
    }
    const stepX = Math.sin(m.yaw) * speed * dt, stepZ = Math.cos(m.yaw) * speed * dt;
    // Do not walk into unloaded terrain or over a cliff taller than three blocks.
    const safeStep = (x, z) => {
      if (!world.getChunk(Math.floor(x) >> 4, Math.floor(z) >> 4)?.gen) return false;
      if (LIQ[world.getBlock(Math.floor(x), Math.floor(m.y), Math.floor(z))]) return false;
      for (let y = Math.floor(m.y) - 1; y >= Math.floor(m.y) - 3; y--) if (SOLID[world.getBlock(Math.floor(x), y, Math.floor(z))]) return true;
      return false;
    };
    let blocked = false;
    if (safeStep(m.x + stepX, m.z) && !mobCollides(m, m.x + stepX, m.y, m.z)) m.x += stepX; else blocked = true;
    if (safeStep(m.x, m.z + stepZ) && !mobCollides(m, m.x, m.y, m.z + stepZ)) m.z += stepZ; else blocked = true;
    if (blocked && speed > 0) { if (m.grounded) m.vy = 7.5; if (!aim) m.turn = 0; }
    m.vy = Math.max(-25, m.vy - 24 * dt);
    const n = Math.max(1, Math.ceil(Math.abs(m.vy * dt) / 0.15)), delta = m.vy * dt / n;
    m.grounded = false;
    for (let k = 0; k < n; k++) {
      if (mobCollides(m, m.x, m.y + delta, m.z)) { m.grounded = m.vy < 0; m.vy = 0; break; }
      m.y += delta;
    }
    m.walk += speed * dt * 6;
    const env = entityEnvironment(m.x, m.y, m.z, d.width, d.height);
    if (m.type === 'zombie' && sky.d > 0.7 && m.y + d.height >= world.heightAt(Math.floor(m.x), Math.floor(m.z)) && !env.water)
      m.burnTime = Math.max(m.burnTime, 8);
    updateEntityBurning(m, dt, env, amount => damageMob(m, amount));
    trackEntityFall(m, m.y, m.grounded, env.water || env.lava, amount => damageMob(m, amount));
    m.hazardClock -= dt;
    if (env.magma && m.hazardClock <= 0) { damageMob(m, 1); m.hazardClock = 1; }
  }
  updateProjectiles(dt);
}

// Heads must be placed last. Both horizontal axes accept the iron T pattern.
function trySummonGolem(x, y, z) {
  if (world.getBlock(x, y, z) !== B.PUMPKIN || mobs.length >= 48) return false;
  let type = '', blocks = [];
  if (world.getBlock(x, y - 1, z) === B.SNOW && world.getBlock(x, y - 2, z) === B.SNOW) {
    type = 'snow_golem'; blocks = [[x, y, z], [x, y - 1, z], [x, y - 2, z]];
  } else if (world.getBlock(x, y - 1, z) === B.IRON_BLOCK && world.getBlock(x, y - 2, z) === B.IRON_BLOCK) {
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      if (world.getBlock(x - dx, y - 1, z - dz) === B.IRON_BLOCK && world.getBlock(x + dx, y - 1, z + dz) === B.IRON_BLOCK &&
        !SOLID[world.getBlock(x - dx, y - 2, z - dz)] && !SOLID[world.getBlock(x + dx, y - 2, z + dz)]) {
        type = 'iron_golem'; blocks = [[x, y, z], [x, y - 1, z], [x, y - 2, z], [x - dx, y - 1, z - dz], [x + dx, y - 1, z + dz]]; break;
      }
    }
  }
  if (!type) return false;
  const previous = blocks.map(p => world.getBlock(...p));
  for (const p of blocks) world.setBlock(...p, B.AIR);
  if (mobCollides({ type }, x + 0.5, y - 2 + 0.02, z + 0.5)) {
    blocks.forEach((p, i) => world.setBlock(...p, previous[i])); toast('傀儡周围需要更多空间'); return false;
  }
  spawnMob(type, x + 0.5, y - 2 + 0.02, z + 0.5);
  gameSound('golem'); toast(MOB_TYPES[type].name + ' 已苏醒，会自动守护附近！'); return true;
}
