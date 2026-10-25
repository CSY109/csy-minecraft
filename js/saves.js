'use strict';

const SAVE_LIMIT = 3, SAVE_VERSION = 1;
let activeSaveSlot = null, saveCatalog = [], deleteArmed = null, openedSaveDatabase = null;
let saveWrites = Promise.resolve();
const saveDatabase = new Promise((resolve, reject) => {
  try {
    const request = indexedDB.open('csys-minecraft-worlds', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('worlds', { keyPath: 'slot' });
      request.result.createObjectStore('slots', { keyPath: 'slot' });
    };
    request.onsuccess = () => {
      openedSaveDatabase = request.result;
      request.result.onversionchange = () => { openedSaveDatabase = null; request.result.close(); };
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('请关闭其他游戏页面后重试'));
  } catch (error) { reject(error); }
});
function saveTransaction(stores, mode, action) {
  const run = db => new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode); let result;
    try { result = action(tx); } catch (error) { tx.abort(); reject(error); return; }
    tx.oncomplete = () => resolve(result?.result);
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('无法写入存档'));
  });
  // Start a transaction synchronously when the connection is already open.
  // In particular, pagehide must not defer the final write into a promise chain.
  return openedSaveDatabase ? run(openedSaveDatabase) : saveDatabase.then(run);
}
function validSaveSlot(slot) {
  if (!Number.isInteger(slot) || slot < 1 || slot > SAVE_LIMIT) throw new Error('最多只能有三个存档');
  return slot;
}
function readGameSave(slot) { validSaveSlot(slot); return saveTransaction(['worlds'], 'readonly', tx => tx.objectStore('worlds').get(slot)); }
function saveSummary(record) { return { slot: record.slot, savedAt: record.savedAt, seed: record.seed, mode: record.mode }; }
function writeGameSave(record) {
  validSaveSlot(record.slot);
  return saveTransaction(['worlds', 'slots'], 'readwrite', tx => {
    tx.objectStore('worlds').put(record); tx.objectStore('slots').put(saveSummary(record));
  });
}
const saveMenuReady = saveTransaction(['slots'], 'readonly', tx => tx.objectStore('slots').getAll()).then(rows => {
  saveCatalog = rows.filter(r => Number.isInteger(r.slot) && r.slot >= 1 && r.slot <= SAVE_LIMIT);
  if (!started && saveCatalog.length) $('mode').value = latestSave().mode;
  updateSaveMenu();
});
saveMenuReady.catch(showSaveError);
function latestSave() { return saveCatalog.slice().sort((a, b) => b.savedAt - a.savedAt)[0]; }
function captureGameSave(slot = activeSaveSlot) {
  validSaveSlot(slot);
  const states = new Map(dimensionStates); states.set(world.dimension, { world, mobs });
  const portalKeys = new Map();
  for (const [name, state] of states) state.world.portals.forEach((p, i) => portalKeys.set(p, name + ':' + i));
  const worlds = [];
  for (const [name, state] of states) {
    const w = state.world, physics = w.physics;
    worlds.push({ dimension: name, seed: w.seed,
      chunks: [...w.chunks.values()].filter(c => c.gen).map(c => ({ cx: c.cx, cz: c.cz, maxY: c.maxY, blocks: c.blocks.slice(), hm: c.hm.slice() })),
      edits: [...w.edits].map(([key, edits]) => [key, [...edits]]),
      physics: { clock: physics.clock, tick: physics.tick, levels: [...physics.levels], queue: [...physics.queue.values()].map(e => ({ ...e })),
        falling: physics.falling.map(e => ({ ...e })), fireAges: [...physics.fireAges], portalsDirty: physics.portalsDirty },
      portals: w.portals.map(p => ({ x: p.x, y: p.y, z: p.z, axis: p.axis, width: p.width, height: p.height,
        invalid: p.invalid, link: portalKeys.get(p.link) || null })),
      mobs: state.mobs.map(m => ({ ...m })) });
  }
  const standing = standingSleepPlayer();
  return { version: SAVE_VERSION, slot, savedAt: Date.now(), seed: world.seed, mode: gameMode, dimension: world.dimension,
    worlds, player: { ...standing, p: standing.p.slice(), v: standing.v.slice() }, spawnPoint: spawnPoint.slice(), bedRespawn: bedRespawn ? { ...bedRespawn } : null,
    bag: { ...bag }, vitals: { ...vitals, fallTop: sleeping.active ? standing.p[1] : vitals.fallTop }, dead, deathCause: $('deathCause').textContent, gameTime, timeScale, sel, selectedArrow,
    hotbars: { survival: (gameMode === 'survival' ? hotbar : modeHotbars.survival).slice(),
      creative: (gameMode === 'creative' ? hotbar : modeHotbars.creative).slice() },
    projectiles: projectiles.map(p => ({ ...p, p: p.p.slice(), v: p.v.slice(), owner: null, ownerId: p.owner?.id ?? null })) };
}
function saveCurrentGame({ notify = false, force = false } = {}) {
  if (!started || !world || activeSaveSlot === null || sessionBusy && !force) return Promise.resolve(false);
  const record = captureGameSave();
  // IndexedDB serialises read/write transactions on these stores in creation
  // order, including the final transaction created while the page is closing.
  const write = writeGameSave(record).then(() => {
    saveCatalog = saveCatalog.filter(s => s.slot !== record.slot); saveCatalog.push(saveSummary(record)); updateSaveMenu();
    if (notify) toast('世界 ' + record.slot + ' 已保存');
    return true;
  });
  saveWrites = write; return write;
}
function queueGameSave() {
  if (!started || sessionBusy || activeSaveSlot === null) return;
  saveCurrentGame().catch(showSaveError);
}
function validateGameSave(record) {
  if (!record || record.version !== SAVE_VERSION || !['survival', 'creative'].includes(record.mode) ||
      !Array.isArray(record.worlds) || !record.worlds.some(w => w.dimension === record.dimension) ||
      record.player?.p?.length !== 3 || !record.player.p.every(Number.isFinite) ||
      record.hotbars?.survival?.length !== 9 || record.hotbars?.creative?.length !== 9) throw new Error('此存档无法读取，原存档已保留');
  for (const state of record.worlds) for (const c of state.chunks)
    if (!(c.blocks instanceof Uint8Array) || c.blocks.length !== CS * CS * CH || c.hm?.length !== CS * CS) throw new Error('存档地形数据不完整');
}
function releaseGameWorld() {
  resetBedSleep(); bedRespawn = null;
  worldJobs.cancel(); resetTouchInput(); stopEnvironmentSounds();
  const worlds = new Set([...dimensionStates.values()].map(state => state.world)); if (world) worlds.add(world);
  for (const w of worlds) for (const c of w.chunks.values()) freeChunkMesh(c);
  dimensionStates.clear(); mobs.length = projectiles.length = particles.length = 0;
  world = null; started = invOpen = dead = false; needed = []; lastCx = lastCz = 1e9;
  target = mobTarget = null; spawnClock = combatClock = 0; portalCharge = portalCooldown = 0;
  $('inv').style.display = 'none'; $('death').hidden = true; $('fireOverlay').hidden = true; $('portalOverlay').style.opacity = 0;
  activeSaveSlot = null; document.body.classList.remove('playing'); $('seed').disabled = false;
}
function restoreGameSave(record, mode) {
  const portalMap = new Map();
  for (const state of record.worlds) {
    const w = new World(state.seed, state.dimension);
    for (const input of state.chunks) {
      const c = new Chunk(input.cx, input.cz); Object.assign(c, input, { gen: true }); w.chunks.set(w.key(c.cx, c.cz), c);
    }
    w.edits = new Map(state.edits.map(([key, edits]) => [key, new Map(edits)]));
    Object.assign(w.physics, { clock: state.physics.clock, tick: state.physics.tick,
      levels: new Map(state.physics.levels), queue: new Map(state.physics.queue.map(e => [w.physics.key(e.x, e.y, e.z), e])),
      falling: state.physics.falling, fireAges: new Map(state.physics.fireAges), portalsDirty: state.physics.portalsDirty });
    w.portals = state.portals.map((p, i) => { const portal = { ...p, world: w, link: null }; portalMap.set(state.dimension + ':' + i, portal); return portal; });
    dimensionStates.set(state.dimension, { world: w, mobs: state.mobs });
  }
  for (const state of record.worlds) state.portals.forEach((p, i) => { portalMap.get(state.dimension + ':' + i).link = portalMap.get(p.link) || null; });
  world = dimensionStates.get(record.dimension).world;
  mobs.push(...dimensionStates.get(record.dimension).mobs); mobSerial = Math.max(0, ...record.worlds.flatMap(w => w.mobs.map(m => m.id)));
  Object.assign(player, record.player, { p: record.player.p.slice(), v: record.player.v.slice(), sprint: false, sneak: false });
  resetVitals(); Object.assign(vitals, record.vitals); dead = !!record.dead;
  spawnPoint = record.spawnPoint.slice(); bedRespawn = record.bedRespawn ? { ...record.bedRespawn } : null; gameTime = record.gameTime; timeScale = record.timeScale;
  for (const id of Object.keys(bag)) delete bag[id]; Object.assign(bag, record.bag);
  modeHotbars.survival = record.hotbars.survival.slice(); modeHotbars.creative = record.hotbars.creative.slice();
  gameMode = record.mode; hotbar.splice(0, 9, ...record.hotbars[gameMode]); sel = clamp(record.sel, 0, 8); selectedArrow = record.selectedArrow;
  const ownerById = new Map(mobs.map(m => [m.id, m]));
  projectiles.push(...(record.projectiles || []).map(p => ({ ...p, owner: ownerById.get(p.ownerId) || null })));
  if (mode !== gameMode) { dead = false; if (vitals.health <= 0) vitals.health = 20; switchGameMode(mode); }
  if (isSurvival()) player.fly = false;
  $('mode').value = gameMode; $('seed').value = String(record.seed); $('seed').disabled = true;
  $('deathCause').textContent = record.deathCause || ''; $('death').hidden = !dead;
  inventoryStamp = hudStamp = ''; resetTouchInput(); resetSoundscape();
  renderDist = parseInt($('rd').value); buildHotbar(); updateHUD();
}
async function prepareSavedView() {
  const cx = Math.floor(player.p[0]) >> 4, cz = Math.floor(player.p[2]) >> 4;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!world.getChunk(cx + dx, cz + dz)?.gen) {
    if (worldJobs.available()) await worldJobs.request(world, 'generate', cx + dx, cz + dz);
    else { world.generate(cx + dx, cz + dz); await new Promise(resolve => setTimeout(resolve, 0)); }
  }
  const c = world.getChunk(cx, cz);
  if (worldJobs.available()) await worldJobs.request(world, 'mesh', c);
  else uploadChunk(c, world.meshChunk(c));
}
async function changeSaveSession(action) {
  if (sessionBusy) return;
  sessionBusy = true; paused = true; resetTouchInput(); stopEnvironmentSounds(); updateSaveMenu();
  if (document.pointerLockElement) document.exitPointerLock();
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  $('menu').style.display = 'none'; $('loading').style.display = 'flex'; updateTouchUI();
  try {
    if (started) await saveCurrentGame({ force: true });
    await action();
  } catch (error) {
    if (world && !started) releaseGameWorld();
    throw error;
  } finally {
    sessionBusy = false; $('loading').style.display = 'none'; touchStamp = ''; updateSaveMenu();
    if (started && !dead && !document.hidden) { last = performance.now(); resumeGame(); }
    else { paused = true; $('menu').style.display = dead ? 'none' : 'flex'; updateTouchUI(); }
  }
}
async function createSaveSlot(slot, mode = $('mode').value) {
  validSaveSlot(slot); await saveMenuReady;
  const seed = started ? '' : $('seed').value;
  return changeSaveSession(async () => {
    if (await readGameSave(slot)) throw new Error('此存档位已被使用，请选择空存档');
    releaseGameWorld(); activeSaveSlot = slot; $('mode').value = mode; $('seed').value = seed;
    initAudio(); await startGame(); await saveCurrentGame({ force: true });
  });
}
async function loadSaveSlot(slot, mode) {
  validSaveSlot(slot); await saveMenuReady;
  return changeSaveSession(async () => {
    const record = await readGameSave(slot); validateGameSave(record);
    await ensureGameGraphics();
    releaseGameWorld(); restoreGameSave(record, mode || record.mode); activeSaveSlot = slot;
    await prepareSavedView(); started = true; paused = true; document.body.classList.add('playing');
    initAudio(); await saveCurrentGame({ force: true });
  });
}
async function startOrContinueGame() {
  await saveMenuReady;
  const latest = latestSave();
  if (latest) return loadSaveSlot(latest.slot, $('mode').value);
  return createSaveSlot(1);
}
async function saveAndExit() {
  return changeSaveSession(async () => { releaseGameWorld(); paused = true; });
}
async function deleteSaveSlot(slot) {
  validSaveSlot(slot);
  if (started && activeSaveSlot === slot) throw new Error('请先保存并退出，再删除此存档');
  await saveWrites.catch(() => {});
  await saveTransaction(['worlds', 'slots'], 'readwrite', tx => { tx.objectStore('worlds').delete(slot); tx.objectStore('slots').delete(slot); });
  saveCatalog = saveCatalog.filter(s => s.slot !== slot); deleteArmed = null; updateSaveMenu();
}
function showSaveError(error) {
  console.error(error);
  const message = error?.name === 'QuotaExceededError' ? '存档空间不足，未覆盖原存档' : error?.message || '此浏览器暂时无法保存存档';
  $('saveStatus').textContent = message; toast(message);
}
function updateSaveMenu() {
  $('saveActions').hidden = !started; $('saveButton').disabled = $('saveExitButton').disabled = sessionBusy;
  $('play').textContent = started || saveCatalog.length ? '继续游戏' : '开始游戏';
  if ($('savesDialog').open) renderSaveSlots();
}
function renderSaveSlots(preserve = true) {
  const choices = new Map(preserve ? [...$('saveSlots').querySelectorAll('article')].map(row => [Number(row.dataset.slot), row.querySelector('select').value]) : []);
  const list = $('saveSlots'); list.replaceChildren();
  for (let slot = 1; slot <= SAVE_LIMIT; slot++) {
    const meta = saveCatalog.find(s => s.slot === slot), row = document.createElement('article'); row.className = 'saveSlot'; row.dataset.slot = slot;
    const info = document.createElement('div'), title = document.createElement('strong'), detail = document.createElement('small');
    title.textContent = meta ? '世界 ' + slot + (started && slot === activeSaveSlot ? ' · 当前' : '') : '空存档 ' + slot;
    detail.textContent = meta ? new Date(meta.savedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '新建一个世界';
    info.append(title, detail);
    const mode = document.createElement('select'); mode.setAttribute('aria-label', '存档 ' + slot + ' 模式');
    for (const [value, label] of [['survival', '生存'], ['creative', '创造']]) { const option = document.createElement('option'); option.value = value; option.textContent = label; mode.append(option); }
    mode.value = choices.get(slot) || (started && slot === activeSaveSlot ? gameMode : meta?.mode || $('mode').value);
    const enter = document.createElement('button'); enter.textContent = meta ? '进入' : '新建'; enter.disabled = sessionBusy;
    enter.setAttribute('aria-label', (meta ? '进入' : '新建') + '存档 ' + slot);
    enter.onclick = () => { requestMobileLandscape(); initAudio(); (meta ? loadSaveSlot(slot, mode.value) : createSaveSlot(slot, mode.value)).catch(showSaveError); };
    row.append(info, mode, enter);
    if (meta) {
      const del = document.createElement('button'); del.className = 'deleteSave'; del.textContent = deleteArmed === slot ? '确认删除' : '删除';
      del.setAttribute('aria-label', (deleteArmed === slot ? '确认删除' : '删除') + '存档 ' + slot); del.disabled = sessionBusy || started && activeSaveSlot === slot;
      del.onclick = () => { if (deleteArmed === slot) deleteSaveSlot(slot).catch(showSaveError); else { deleteArmed = slot; renderSaveSlots(); } }; row.append(del);
    }
    list.append(row);
  }
}
$('savesButton').onclick = () => { deleteArmed = null; $('saveStatus').textContent = '存档保存在当前浏览器'; renderSaveSlots(false); $('savesDialog').showModal(); };
$('closeSaves').onclick = () => $('savesDialog').close();
$('saveButton').onclick = () => saveCurrentGame({ notify: true }).catch(showSaveError);
$('saveExitButton').onclick = () => saveAndExit().catch(showSaveError);
setInterval(() => { if (started && !paused && !invOpen && !sessionBusy) saveCurrentGame().catch(showSaveError); }, 20000);
window.addEventListener('pagehide', () => { saveCurrentGame().catch(() => {}); });
