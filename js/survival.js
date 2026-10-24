'use strict';

let gameMode = 'survival', dead = false, spawnPoint = [0, 80, 0];
const bag = Object.create(null);
const vitals = { health: 20, hunger: 20, air: 10, invulnerable: 0, regen: 0, hazard: 0, foodClock: 0, fallTop: 0 };
const mining = { key: '', elapsed: 0, duration: 0, sound: 0, chips: 0, held: 0, stage: -1 };
const bow = { active: false, elapsed: 0, slot: -1, ammo: I.ARROW, raise: 0, recoil: 0 };
let selectedArrow = I.ARROW;
const modeHotbars = { survival: null, creative: null };
let inventoryTab = 'all', inventoryStamp = '', hudStamp = '';
function isSurvival() { return gameMode === 'survival'; }
function countItem(id) { return bag[id] || 0; }
function addItem(id, count = 1) {
  if (!id || count <= 0) return;
  bag[id] = countItem(id) + count;
  if (!hotbar.includes(id)) { const empty = hotbar.indexOf(0); if (empty >= 0) hotbar[empty] = id; }
  inventoryStamp = ''; refreshHotbar();
}
function spendItem(id, count = 1) {
  if (!isSurvival()) return true;
  if (countItem(id) < count) return false;
  bag[id] -= count; inventoryStamp = ''; refreshHotbar(); return true;
}
function initSurvival() {
  gameMode = $('mode').value; $('mode').disabled = false; $('seed').disabled = true;
  selectedArrow = I.ARROW; cancelBow();
  for (const key of Object.keys(bag)) delete bag[key];
  modeHotbars.survival = [0, 0, 0, 0, 0, 0, 0, 0, I.APPLE];
  modeHotbars.creative = [B.GRASS, B.PLANKS, I.IRON_PICK, I.IRON_SWORD, I.BOW, I.ARROW, B.OBSIDIAN, I.FLINT_STEEL, I.PIG_EGG];
  hotbar.splice(0, 9, ...modeHotbars[gameMode]);
  // A little food gives a new player time to establish a shelter; all tools are crafted.
  bag[I.APPLE] = 4;
  if (isSurvival()) hotbar[8] = I.APPLE;
  resetVitals(); spawnPoint = player.p.slice(); vitals.fallTop = player.p[1];
}
function switchGameMode(next) {
  if (!['survival', 'creative'].includes(next) || next === gameMode || dead) return;
  modeHotbars[gameMode] = hotbar.slice();
  gameMode = next; $('mode').value = next;
  hotbar.splice(0, 9, ...modeHotbars[next]);
  cancelBow(); resetMining(); mouseL = mouseR = false; actTimer = 0;
  for (const k in keys) keys[k] = false;
  if (isSurvival()) player.fly = false;
  player.v = [0, 0, 0]; player.sprint = player.sneak = false;
  vitals.fallTop = player.p[1]; timeScale = 1; lastSpace = 0;
  inventoryStamp = hudStamp = ''; refreshHotbar(); updateHUD();
  if (invOpen) renderInventory(true);
}
function cancelBow(resetPose = true) {
  bow.active = false; bow.elapsed = 0; bow.slot = -1;
  if (resetPose) bow.raise = bow.recoil = 0;
}
function selectArrow(id) {
  if (!ITEMS[id]?.ammo) return;
  cancelBow(); selectedArrow = id;
  if (hotbar[sel] === I.BOW) showHeldName(I.BOW);
  else toast('已选用' + NAMES[id]);
}
function beginBow() {
  if (bow.active) return;
  if (isSurvival() && !countItem(selectedArrow)) { toast('缺少' + NAMES[selectedArrow] + '：E 合成 / R 切换箭种'); return; }
  bow.active = true; bow.elapsed = 0; bow.slot = sel; bow.ammo = selectedArrow; bow.recoil = 0; swing = 0; resetMining();
}
function updateBow(dt) {
  if (!bow.active) return;
  if (!mouseR || bow.slot !== sel || hotbar[sel] !== I.BOW || dead || invOpen ||
      isSurvival() && (!countItem(I.BOW) || !countItem(bow.ammo))) { cancelBow(); return; }
  bow.elapsed = Math.min(1, bow.elapsed + dt);
}
function updateBowPose(dt) {
  if (hotbar[sel] !== I.BOW || isSurvival() && !countItem(I.BOW)) { bow.raise = bow.recoil = 0; return; }
  bow.raise += clamp((bow.active ? 1 : 0) - bow.raise, -dt * 6, dt * 6);
  bow.recoil = Math.max(0, bow.recoil - dt);
}
function releaseBow() {
  const elapsed = bow.elapsed, ammo = bow.ammo, ready = bow.active && bow.slot === sel && hotbar[sel] === I.BOW &&
    hasGameFocus() && (!isSurvival() || countItem(I.BOW));
  cancelBow(false);
  const power = Math.min(1, (elapsed * elapsed + elapsed * 2) / 3);
  if (!ready || power < 0.1 || !spendItem(ammo)) { bow.raise = bow.recoil = 0; return; }
  const explosive = ammo === I.EXPLOSIVE_ARROW;
  shootProjectile(eyePos(), lookDir(), explosive ? 'explosive_arrow' : 'arrow', null, explosive ? 20 : Math.ceil(7 * power), 30 * power);
  gameSound('bow'); bow.recoil = 0.18; swing = 0;
}
function resetVitals() {
  Object.assign(vitals, { health: 20, hunger: 20, air: 10, invulnerable: 0, regen: 0, hazard: 0, foodClock: 0 });
  dead = false; hudStamp = ''; $('death').hidden = true;
  $('damage').style.opacity = 0;
}
function damagePlayer(amount, cause = '受伤') {
  if (!isSurvival() || dead || vitals.invulnerable > 0 || amount <= 0) return;
  vitals.health = Math.max(0, vitals.health - amount); vitals.invulnerable = 0.75;
  gameSound(cause === '溺水' ? 'drown' : cause === '熔岩' || cause === '岩浆块' ? 'burn' : 'hurt'); $('damage').style.opacity = 0.65;
  if (vitals.health <= 0) {
    dead = true; mouseL = mouseR = false; resetMining(); cancelBow();
    $('deathCause').textContent = cause + '。背包物品保留，重生回到出生点。';
    if (invOpen) { invOpen = false; $('inv').style.display = 'none'; }
    document.exitPointerLock(); $('menu').style.display = 'none'; $('death').hidden = false;
  }
}
function respawnPlayer() {
  returnToOverworld();
  const [x, , z] = spawnPoint;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) world.generate((Math.floor(x) >> 4) + dx, (Math.floor(z) >> 4) + dz);
  player.p = [x, world.surfaceY(Math.floor(x), Math.floor(z)) + 1.01, z];
  player.v = [0, 0, 0]; player.fly = false; player.onGround = false;
  resetVitals(); vitals.invulnerable = 3; vitals.fallTop = player.p[1];
  resumeGame();
}
function updateVitals(dt) {
  vitals.invulnerable = Math.max(0, vitals.invulnerable - dt);
  $('damage').style.opacity = Math.max(0, Number($('damage').style.opacity || 0) - dt * 2);
  if (!isSurvival() || dead) return;
  if (player.inWater) vitals.fallTop = player.p[1];
  else if (player.onGround) {
    const fall = vitals.fallTop - player.p[1];
    if (fall > 3.5) damagePlayer(Math.floor(fall - 3), '摔落');
    vitals.fallTop = player.p[1];
  } else vitals.fallTop = Math.max(vitals.fallTop, player.p[1]);
  if (player.eyeWater) vitals.air = Math.max(0, vitals.air - dt); else vitals.air = Math.min(10, vitals.air + dt * 3);
  vitals.foodClock += dt * (player.sprint ? 2.5 : 1);
  if (vitals.foodClock >= 24) { vitals.hunger = Math.max(0, vitals.hunger - 1); vitals.foodClock = 0; }
  if (vitals.hunger <= 5) player.sprint = false;
  vitals.regen += dt; vitals.hazard += dt;
  if (vitals.regen > 4) {
    vitals.regen = 0;
    if (vitals.hunger >= 16 && vitals.health < 20) { vitals.health = Math.min(20, vitals.health + 1); vitals.hunger -= 0.5; }
    if (vitals.hunger === 0) damagePlayer(1, '饥饿');
  }
  if (vitals.hazard >= 1) {
    vitals.hazard = 0;
    if (vitals.air === 0) damagePlayer(2, '溺水');
    const x = Math.floor(player.p[0]), y = Math.floor(player.p[1]), z = Math.floor(player.p[2]);
    if (world.getBlock(x, y, z) === B.LAVA || world.getBlock(x, y + 1, z) === B.LAVA) damagePlayer(5, '熔岩');
    if (world.getBlock(x, y, z) === B.FIRE || world.getBlock(x, y + 1, z) === B.FIRE) damagePlayer(2, '火焰');
    if (!player.sneak && world.getBlock(x, y - 1, z) === B.MAGMA) damagePlayer(1, '岩浆块');
    if ([[x, y, z], [x + 1, y, z], [x - 1, y, z], [x, y, z + 1], [x, y, z - 1]].some(p => world.getBlock(...p) === B.CACTUS)) damagePlayer(1, '仙人掌');
  }
}
function resetMining() { mining.key = ''; mining.elapsed = 0; mining.stage = -1; }
function updateMining(dt) {
  if (!mouseL || !target || dead || mobTarget && mobTarget.distance < target.t) { resetMining(); return; }
  const held = hotbar[sel];
  if (!isSurvival()) {
    actTimer -= dt;
    if (actTimer <= 0) { breakBlock(); actTimer = 0.2; }
    return;
  }
  const key = [target.x, target.y, target.z, target.id, held].join(',');
  if (mining.key !== key) Object.assign(mining, { key, elapsed: 0, sound: 0, chips: 0, stage: -1, duration: miningSeconds(target.id, held), held });
  mining.elapsed += dt * (player.eyeWater ? 0.35 : 1); mining.sound -= dt;
  if (mining.sound <= 0 && Number.isFinite(mining.duration)) { blockSound(target.id, 0.08); swing = 1; mining.sound = 0.3; }
  const progress = Number.isFinite(mining.duration) ? Math.min(1, mining.elapsed / mining.duration) : 0;
  mining.stage = Number.isFinite(mining.duration) ? Math.min(9, Math.floor(progress * 10)) : -1;
  mining.chips -= dt;
  if (mining.chips <= 0 && mining.stage >= 0) { spawnBlockChips(target); mining.chips = 0.12; }
  if (progress >= 1) { breakBlock(); resetMining(); }
}
function nearWorkbench() {
  if (!world) return false;
  const [px, py, pz] = player.p.map(Math.floor);
  for (let y = py - 2; y <= py + 2; y++) for (let z = pz - 4; z <= pz + 4; z++) for (let x = px - 4; x <= px + 4; x++) if (world.getBlock(x, y, z) === B.WORKBENCH) return true;
  return false;
}
function canCraft(r) { return !isSurvival() || ((!r.bench || nearWorkbench()) && r.ingredients.every(([id, n]) => countItem(id) >= n)); }
function craft(r) {
  if (!canCraft(r)) return;
  if (isSurvival()) for (const [id, n] of r.ingredients) bag[id] -= n;
  addItem(r.out, r.count); gameSound('craft'); toast('合成：' + NAMES[r.out] + ' ×' + r.count); renderInventory(true);
}
function renderInventory(force = false) {
  const search = $('invSearch').value.trim();
  const stamp = gameMode + JSON.stringify(bag) + inventoryTab + search + hotbar[sel] + nearWorkbench();
  if (!force && inventoryStamp === stamp) return;
  inventoryStamp = stamp;
  $('invTitle').textContent = isSurvival() ? '背包与合成' : '创造物品栏与合成';
  $('invHint').textContent = (isSurvival() ? '点击物品装入当前快捷栏 · 工作台附近可制作工具' : '点击物品装入当前快捷栏 · 物品无限 · 刷怪蛋右键召唤') + ' · 弓按住右键蓄力，松开发射；R 切换普通箭 / 爆炸箭，手持弓时也可点击背包里的箭选择';
  const g = $('invgrid'); g.innerHTML = '';
  const ids = [...INVENTORY_BLOCKS, ...Object.keys(ITEMS).map(Number)].filter(id => (!isSurvival() || countItem(id) > 0) && NAMES[id].includes(search));
  if (inventoryTab !== 'craft') for (const id of ids) {
    const d = document.createElement('button'); d.className = 'slot'; d.title = NAMES[id]; d.setAttribute('aria-label', NAMES[id]);
    const cv = document.createElement('canvas'); cv.width = cv.height = 32; cv.getContext('2d').drawImage(icon(id), 0, 0); d.appendChild(cv);
    if (isSurvival() && countItem(id) > 1) { const n = document.createElement('b'); n.textContent = countItem(id); d.appendChild(n); }
    d.onclick = () => {
      if (ITEMS[id]?.ammo) { selectArrow(id); if (hotbar[sel] === I.BOW) return; }
      hotbar[sel] = id; refreshHotbar(); showHeldName(id);
    }; g.appendChild(d);
  }
  if (!g.children.length && inventoryTab !== 'craft') g.textContent = isSurvival() ? '背包空空，先采集一些原木吧。' : '没有匹配的物品';
  $('recipes').innerHTML = '';
  if (inventoryTab !== 'bag') for (const r of RECIPES.filter(r => NAMES[r.out].includes(search))) {
    const row = document.createElement('button'); row.className = 'recipe'; row.disabled = !canCraft(r);
    const img = document.createElement('canvas'); img.width = img.height = 32; img.getContext('2d').drawImage(icon(r.out), 0, 0);
    const title = document.createElement('span'); title.textContent = NAMES[r.out] + ' ×' + r.count;
    const cost = document.createElement('small'); cost.textContent = r.ingredients.map(([id, n]) => NAMES[id] + ' ' + (isSurvival() ? countItem(id) + '/' : '×') + n).join(' · ') + (r.bench ? ' · 需要附近工作台' : '') + (r.category === '冶炼' ? ' · 简易冶炼' : '');
    title.appendChild(cost); row.append(img, title); row.onclick = () => craft(r); $('recipes').appendChild(row);
  }
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === inventoryTab));
}
function useHeldItem() {
  const id = hotbar[sel], item = ITEMS[id];
  if (isSurvival() && !countItem(id)) return false;
  if (item?.ammo) { if (selectedArrow !== id) selectArrow(id); return true; }
  if (item?.action) return useWorldTool(id);
  if (item?.food) {
    if (isSurvival() && vitals.hunger >= 20) { toast('还不饿'); return true; }
    if (!spendItem(id)) return true;
    vitals.hunger = Math.min(20, vitals.hunger + item.food); gameSound('eat'); swing = 1; return true;
  }
  if (item?.tool === 'bow') {
    beginBow(); return true;
  }
  if (item?.mob) {
    if (!isSurvival() && target) spawnMob(item.mob, target.x + target.nx + 0.5, target.y + target.ny, target.z + target.nz + 0.5);
    return true;
  }
  return !!item;
}
function updateHUD() {
  const stamp = [gameMode, Math.ceil(vitals.health), Math.ceil(vitals.hunger), Math.ceil(vitals.air), player.eyeWater, dead].join(':');
  if (stamp === hudStamp) return; hudStamp = stamp;
  $('vitals').hidden = !isSurvival();
  drawSurvivalHUD();
}

function bindSurvivalUI() {
  $('mode').onchange = () => { if (started) switchGameMode($('mode').value); };
  $('respawn').onclick = respawnPlayer;
  $('closeInv').onclick = () => setInv(false);
  $('invSearch').oninput = () => renderInventory(true);
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { inventoryTab = b.dataset.tab; renderInventory(true); });
  $('volume').oninput = () => { if (masterGain) masterGain.gain.value = Number($('volume').value) / 100; };
}
