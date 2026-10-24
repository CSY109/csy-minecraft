'use strict';
let deviceMode = matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop';
const touchMove = { x: 0, z: 0 };
let touchStamp = '', lookPointer = null, stickPointer = null;
function isTouchMode() { return deviceMode === 'mobile'; }
function hasGameFocus() { return started && !paused && !dead && !invOpen && (isTouchMode() || document.pointerLockElement === canvas); }
function resetTouchInput() {
  touchMove.x = touchMove.z = 0; lookPointer = stickPointer = null;
  $('joystick').firstElementChild.style.transform = '';
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
  touchStamp = ''; updateTouchUI();
}
function updateTouchUI() {
  const stamp = [deviceMode, started, paused, dead, invOpen, gameMode, player.fly, hotbar[sel]].join(':');
  if (stamp === touchStamp) return; touchStamp = stamp;
  $('touchControls').hidden = !isTouchMode() || !hasGameFocus();
  $('touchFly').hidden = isSurvival(); $('touchFly').classList.toggle('active', player.fly);
  $('touchAmmo').hidden = hotbar[sel] !== I.BOW;
  $('touchJump').textContent = player.fly ? '上升' : '跳跃'; $('touchSneak').textContent = player.fly ? '下降' : '潜行';
}
matchMedia('(pointer: coarse)').addEventListener('change', e => setDevice(e.matches ? 'mobile' : 'desktop'));
for (const [open, panel, close] of [['settingsButton', 'settingsDialog', 'closeSettings'], ['helpButton', 'helpDialog', 'closeHelp']]) {
  $(open).onclick = () => $(panel).showModal(); $(close).onclick = () => $(panel).close();
  $(panel).addEventListener('click', e => { if (e.target === $(panel) && (e.clientX < e.target.getBoundingClientRect().left || e.clientX > e.target.getBoundingClientRect().right || e.clientY < e.target.getBoundingClientRect().top || e.clientY > e.target.getBoundingClientRect().bottom)) $(panel).close(); });
}
$('touchBag').onclick = () => setInv(true); $('touchPause').onclick = pauseGame;
$('touchFly').onclick = () => { if (!isSurvival()) { player.fly = !player.fly; player.v[1] = 0; updateTouchUI(); } };
$('touchAmmo').onclick = () => selectArrow(selectedArrow === I.ARROW ? I.EXPLOSIVE_ARROW : I.ARROW);
function holdButton(id, press, release) {
  let pointer = null;
  $(id).addEventListener('pointerdown', e => {
    if (!hasGameFocus() || pointer !== null) return;
    e.preventDefault(); pointer = e.pointerId; $(id).setPointerCapture(pointer); press();
  });
  const up = e => { if (e.pointerId !== pointer) return; pointer = null; release(e.type === 'pointercancel'); };
  $(id).addEventListener('pointerup', up); $(id).addEventListener('pointercancel', up);
}
holdButton('touchJump', () => { keys.Space = true; }, () => { keys.Space = false; });
holdButton('touchSneak', () => { keys.ShiftLeft = true; }, () => { keys.ShiftLeft = false; });
holdButton('touchAttack', () => { mouseL = true; actTimer = 0; if (mobTarget && !bow.active) attackMob(); }, () => { mouseL = false; resetMining(); });
holdButton('touchUse', () => { mouseR = true; placeBlock(); actTimer = 0.3; }, cancelled => { if (cancelled) cancelBow(); else releaseBow(); mouseR = false; });
const stick = $('joystick');
function moveStick(e) {
  const rect = stick.getBoundingClientRect(), dx = e.clientX - rect.left - rect.width / 2, dy = e.clientY - rect.top - rect.height / 2;
  const distance = Math.hypot(dx, dy), scale = Math.min(1, 38 / (distance || 1));
  touchMove.x = dx * scale / 38; touchMove.z = -dy * scale / 38;
  stick.firstElementChild.style.transform = `translate(${dx * scale}px,${dy * scale}px)`;
}
stick.addEventListener('pointerdown', e => { if (!hasGameFocus()) return; e.preventDefault(); stickPointer = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); });
stick.addEventListener('pointermove', e => { if (e.pointerId === stickPointer) moveStick(e); });
for (const type of ['pointerup', 'pointercancel']) stick.addEventListener(type, e => {
  if (e.pointerId === stickPointer) { stickPointer = null; touchMove.x = touchMove.z = 0; stick.firstElementChild.style.transform = ''; }
});
canvas.addEventListener('pointerdown', e => {
  if (!isTouchMode() || !hasGameFocus() || lookPointer) return;
  e.preventDefault(); lookPointer = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!lookPointer || lookPointer.id !== e.pointerId || !hasGameFocus()) return;
  const dx = e.clientX - lookPointer.x, dy = e.clientY - lookPointer.y;
  lookPointer.x = e.clientX; lookPointer.y = e.clientY;
  if (Math.abs(dx) < 200 && Math.abs(dy) < 200) { player.yaw -= dx * 0.004; player.pitch = clamp(player.pitch - dy * 0.004, -1.5533, 1.5533); }
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
