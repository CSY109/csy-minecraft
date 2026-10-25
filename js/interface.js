'use strict';
let deviceMode = matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop';
const touchMove = { x: 0, z: 0 };
let touchFlightDown = false, touchJumpHeld = false, touchJumpTime = 0;
let touchStamp = '', lookPointer = null;
const dpadPointers = new Map(), touchResetters = [];
function isTouchMode() { return deviceMode === 'mobile'; }
function isPortraitTouch() { return isTouchMode() && innerHeight > innerWidth; }
function hasGameFocus() { return started && !paused && !dead && !invOpen && (isTouchMode() || document.pointerLockElement === canvas); }
function touchPosition(e) {
  return isPortraitTouch() ? { x: e.clientY, y: innerWidth - e.clientX } : { x: e.clientX, y: e.clientY };
}
function resetTouchInput() {
  touchMove.x = touchMove.z = 0; lookPointer = null; dpadPointers.clear();
  touchFlightDown = touchJumpHeld = false; touchJumpTime = 0;
  touchResetters.forEach(reset => reset());
  document.querySelectorAll('#touchControls .held').forEach(button => button.classList.remove('held'));
  for (const k in keys) keys[k] = false;
  mouseL = mouseR = false; cancelBow();
}
function resumeGame() {
  paused = false;
  if (isTouchMode()) {
    $('menu').style.display = 'none'; document.body.classList.add('playing'); updateTouchUI();
  } else {
    const request = canvas.requestPointerLock();
    request?.catch(() => { paused = true; $('menu').style.display = 'flex'; });
  }
}
function pauseGame() {
  resetTouchInput(); paused = true; stopEnvironmentSounds();
  $('menu').style.display = 'flex'; $('play').textContent = '继续游戏'; updateTouchUI();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}
function setDevice(mode) {
  deviceMode = mode === 'mobile' ? 'mobile' : 'desktop'; resetTouchInput();
  document.body.classList.toggle('mobile', isTouchMode());
  if (!started && isTouchMode()) { $('rd').value = '3'; $('rdv').textContent = '3'; }
  touchStamp = ''; updateOrientation();
}
function updateTouchUI() {
  const stamp = [deviceMode, started, paused, dead, invOpen, gameMode, player.fly, hotbar[sel], isPortraitTouch()].join(':');
  if (stamp === touchStamp) return; touchStamp = stamp;
  $('touchControls').hidden = !isTouchMode() || !hasGameFocus();
  const flying = player.fly && !isSurvival();
  document.body.classList.toggle('touchFlying', isTouchMode() && flying);
  $('touchDescend').hidden = !flying;
  $('touchAmmo').hidden = hotbar[sel] !== I.BOW;
  $('touchJump').setAttribute('aria-label', player.fly ? '上升' : '跳跃'); $('touchJump').title = player.fly ? '上升' : '跳跃';
  $('touchJump').querySelector('.touchKeyLabel').textContent = player.fly ? '上升' : '跳跃';
  $('touchSneak').setAttribute('aria-label', player.fly ? '下降' : '潜行'); $('touchSneak').title = player.fly ? '下降' : '潜行';
  $('touchHealth').hidden = $('touchHunger').hidden = !isSurvival();
}
function requestMobileLandscape() {
  if (!isTouchMode()) return;
  const lock = () => { try { screen.orientation?.lock?.('landscape')?.catch(() => {}); } catch {} };
  // Fullscreen/orientation APIs are optional. The viewport below supplies a
  // landscape layout even when an embedded browser refuses both APIs.
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen)
      document.documentElement.requestFullscreen().then(lock).catch(() => {});
    else lock();
  } catch {}
}
function updateOrientation() {
  const rotated = isPortraitTouch();
  document.body.classList.toggle('virtualLandscape', rotated);
  document.documentElement.style.setProperty('--view-width', (rotated ? innerHeight : innerWidth) + 'px');
  document.documentElement.style.setProperty('--view-height', (rotated ? innerWidth : innerHeight) + 'px');
  updateTouchUI();
}
window.addEventListener('resize', () => { resetTouchInput(); touchStamp = ''; updateOrientation(); });
for (const [id, output, suffix] of [['fov', 'fovValue', '°'], ['sensitivity', 'sensitivityValue', '%']])
  $(id).oninput = () => { $(output).value = $(id).value + suffix; };
matchMedia('(pointer: coarse)').addEventListener('change', e => setDevice(e.matches ? 'mobile' : 'desktop'));
for (const [open, panel, close] of [['settingsButton', 'settingsDialog', 'closeSettings'], ['helpButton', 'helpDialog', 'closeHelp']]) {
  $(open).onclick = () => $(panel).showModal(); $(close).onclick = () => $(panel).close();
  $(panel).addEventListener('click', e => { if (e.target === $(panel) && (e.clientX < e.target.getBoundingClientRect().left || e.clientX > e.target.getBoundingClientRect().right || e.clientY < e.target.getBoundingClientRect().top || e.clientY > e.target.getBoundingClientRect().bottom)) $(panel).close(); });
}
$('touchBag').onclick = () => setInv(true); $('touchPause').onclick = pauseGame;
$('touchAmmo').onclick = () => selectArrow(selectedArrow === I.ARROW ? I.EXPLOSIVE_ARROW : I.ARROW);
function holdButton(id, press, release) {
  let pointer = null;
  touchResetters.push(() => {
    if (pointer !== null && $(id).hasPointerCapture(pointer)) $(id).releasePointerCapture(pointer);
    pointer = null;
  });
  $(id).addEventListener('pointerdown', e => {
    if (!hasGameFocus() || pointer !== null) return;
    e.preventDefault(); pointer = e.pointerId; $(id).setPointerCapture(pointer); $(id).classList.add('held'); press();
  });
  const up = e => { if (e.pointerId !== pointer) return; pointer = null; $(id).classList.remove('held'); release(e.type !== 'pointerup'); };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $(id).addEventListener(type, up);
}
function updateTouchFlight(dt) {
  if (!isTouchMode() || !touchJumpHeld || isSurvival() || player.fly) return;
  touchJumpTime += dt;
  if (touchJumpTime >= 0.45) { player.fly = true; player.v[1] = 0; updateTouchUI(); }
}
holdButton('touchJump', () => { keys.Space = true; touchJumpHeld = true; touchJumpTime = 0; }, () => { keys.Space = false; touchJumpHeld = false; touchJumpTime = 0; });
holdButton('touchDescend', () => { touchFlightDown = true; }, () => { touchFlightDown = false; });
holdButton('touchSneak', () => { keys.ShiftLeft = true; }, () => { keys.ShiftLeft = false; });
holdButton('touchAttack', () => { mouseL = true; actTimer = 0; if (mobTarget && !bow.active) attackMob(); }, () => { mouseL = false; resetMining(); });
holdButton('touchUse', () => { mouseR = true; placeBlock(); actTimer = 0.3; }, cancelled => { if (cancelled) cancelBow(); else releaseBow(); mouseR = false; });
const pad = $('dpad'), directions = { touchForward: [0, 1], touchBackward: [0, -1], touchLeft: [-1, 0], touchRight: [1, 0] };
function updateDpad() {
  touchMove.x = touchMove.z = 0;
  for (const id of new Set(dpadPointers.values())) { const dir = directions[id]; if (dir) { touchMove.x += dir[0]; touchMove.z += dir[1]; } }
  for (const id of Object.keys(directions)) $(id).classList.toggle('held', [...dpadPointers.values()].includes(id));
}
pad.addEventListener('pointerdown', e => {
  const id = e.target.closest('button')?.id;
  if (!hasGameFocus() || !directions[id]) return;
  e.preventDefault(); dpadPointers.set(e.pointerId, id); pad.setPointerCapture(e.pointerId); updateDpad();
});
pad.addEventListener('pointermove', e => {
  if (!dpadPointers.has(e.pointerId)) return;
  const id = document.elementFromPoint(e.clientX, e.clientY)?.closest('button')?.id;
  dpadPointers.set(e.pointerId, directions[id] ? id : ''); updateDpad();
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(type, e => {
  if (dpadPointers.delete(e.pointerId)) updateDpad();
});
canvas.addEventListener('pointerdown', e => {
  if (!isTouchMode() || !hasGameFocus() || lookPointer) return;
  e.preventDefault(); lookPointer = { id: e.pointerId, ...touchPosition(e) }; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!lookPointer || lookPointer.id !== e.pointerId || !hasGameFocus()) return;
  const position = touchPosition(e), dx = position.x - lookPointer.x, dy = position.y - lookPointer.y;
  lookPointer.x = position.x; lookPointer.y = position.y;
  const sensitivity = Number($('sensitivity').value) / 100;
  if (Math.abs(dx) < 200 && Math.abs(dy) < 200) { player.yaw -= dx * 0.004 * sensitivity; player.pitch = clamp(player.pitch - dy * 0.004 * sensitivity, -1.5533, 1.5533); }
});
for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, e => { if (lookPointer?.id === e.pointerId) lookPointer = null; });
// Touch browsers can suppress a compatibility click after a multi-finger gesture.
// Activate UI buttons on the trusted pointer release and ignore its duplicate click.
const touchTapTimes = new WeakMap();
document.addEventListener('pointerup', e => {
  if (e.pointerType !== 'touch') return;
  const button = e.target.closest('button,.slot');
  if (!button || button.disabled || typeof button.onclick !== 'function') return;
  e.preventDefault(); touchTapTimes.set(button, performance.now()); button.onclick.call(button, e);
}, true);
document.addEventListener('click', e => {
  const button = e.target.closest('button,.slot');
  if (button && e.isTrusted && e.detail && performance.now() - (touchTapTimes.get(button) ?? -Infinity) < 700) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
document.addEventListener('visibilitychange', () => { if (document.hidden && started) pauseGame(); });
setDevice(deviceMode);
