'use strict';
let actx = null, masterGain = null, audioReady = null;
const decodedSounds = Object.create(null), soundHistory = new Map();
const liveSounds = new Set();
function loadSounds() {
  if (audioReady || !actx) return audioReady;
  audioReady = Promise.all(Object.entries(CLASSIC_SOUNDS).map(async ([name, entries]) => {
    decodedSounds[name] = await Promise.all(entries.map(async src => {
      const bytes = Uint8Array.from(atob(src.split(',')[1]), c => c.charCodeAt(0)); return actx.decodeAudioData(bytes.buffer);
    }));
  })).catch(() => {});
  return audioReady;
}
function playSample(name, volume = 0.12, position = null, pitch = 1, loop = false) {
  const choices = decodedSounds[name];
  if (!actx || actx.state !== 'running' || !choices?.length || liveSounds.size >= 24) return null;
  const previous = soundHistory.get(name) ?? -1;
  let index = choices.length > 1 ? (previous + 1 + Math.floor(Math.random() * (choices.length - 1))) % choices.length : 0;
  soundHistory.set(name, index);
  const src = actx.createBufferSource(), gain = actx.createGain(); src.buffer = choices[index]; src.loop = loop;
  src.playbackRate.value = pitch * (loop ? 1 : 0.94 + Math.random() * 0.12);
  let output = gain;
  if (position && typeof player !== 'undefined') {
    const dx = position[0] - player.p[0], dz = position[2] - player.p[2], dist = Math.hypot(dx, position[1] - player.p[1], dz);
    volume *= Math.max(0, 1 - dist / 24) ** 2;
    if (actx.createStereoPanner) { const pan = actx.createStereoPanner(); pan.pan.value = clamp((dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / 12, -1, 1); gain.connect(pan); output = pan; }
  }
  gain.gain.value = volume; src.connect(gain); output.connect(masterGain); src.start();
  const handle = { src, gain, output, name }; liveSounds.add(handle);
  src.onended = () => { src.disconnect(); gain.disconnect(); if (output !== gain) output.disconnect(); liveSounds.delete(handle); };
  return handle;
}
function initAudio() {
  try {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = actx.createGain(); masterGain.connect(actx.destination);
    }
    masterGain.gain.value = Number(document.getElementById('volume').value) / 100;
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    loadSounds();
  } catch (_) { /* Audio is optional on browsers without Web Audio. */ }
}
function sfx(freq, dur, vol, type = 'lowpass') {
  if (!actx || !masterGain || actx.state !== 'running') return;
  const n = Math.max(1, (actx.sampleRate * dur) | 0);
  const buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
  const src = actx.createBufferSource(); src.buffer = buf;
  const f = actx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = actx.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(masterGain); src.start();
  src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
}
function tone(freq, dur = 0.15, vol = 0.1, wave = 'sine', end = freq, delay = 0) {
  if (!actx || !masterGain || actx.state !== 'running') return;
  const start = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
  o.type = wave; o.frequency.setValueAtTime(freq, start); o.frequency.exponentialRampToValueAtTime(Math.max(20, end), start + dur);
  g.gain.setValueAtTime(vol, start); g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  o.connect(g); g.connect(masterGain); o.start(start); o.stop(start + dur);
  o.onended = () => { o.disconnect(); g.disconnect(); };
}
function blockSound(id, vol, action = 'break') {
  let material = { earth: 'gravel', snow: 'snow', wood: 'wood', stone: 'stone', metal: 'stone', glass: 'stone', grass: 'grass' }[(BLOCK_INFO[id] || {}).sound] || 'stone';
  if (id === B.SAND || id === B.SOUL_SAND) material = 'sand';
  if (id === B.WOOL) material = 'cloth';
  if (playSample(id === B.GLASS && action === 'break' ? 'glass' : (action === 'break' || action === 'place' ? 'dig_' : 'step_') + material, vol)) return;
  const mat = (BLOCK_INFO[id] || {}).sound || 'stone', foot = action === 'step', dur = foot ? 0.07 : 0.14;
  const freq = { earth: 700, snow: 1600, wood: 1100, stone: 2400, metal: 3600, glass: 6500, grass: 4200 }[mat] || 1800;
  sfx(freq, mat === 'glass' && !foot ? 0.3 : dur, vol, mat === 'glass' ? 'highpass' : 'lowpass');
  if (mat === 'wood') tone(foot ? 95 : 150, dur, vol * 0.35, 'triangle', 60);
  if (mat === 'metal' || mat === 'glass') tone(mat === 'metal' ? 720 : 2000, dur * 2, vol * 0.3, 'sine', 320);
}
function gameSound(name, volume = 0.12) {
  const alias = { portal_ignite: 'flint', jump: 'step_gravel', sand_land: 'dig_sand', bucket_fill: 'splash', bucket_pour: 'splash' };
  if (playSample(alias[name] || name, volume)) return;
  if (name === 'craft' || name === 'golem') {
    [330, 440, 660, name === 'golem' ? 880 : 660].forEach((f, i) => tone(f, 0.22, volume, 'triangle', f, i * 0.09));
  } else if (name === 'hurt') { sfx(800, 0.2, volume); tone(170, 0.18, volume, 'sawtooth', 70); }
  else if (name === 'eat') sfx(1400, 0.15, volume);
  else if (name === 'bow') { sfx(5000, 0.13, volume); tone(360, 0.15, volume, 'triangle', 100); }
  else if (name === 'attack') sfx(3500, 0.1, volume);
  else if (name === 'explode') { sfx(350, 0.8, volume * 2); tone(70, 0.5, volume, 'triangle', 20); }
  else if (name === 'pig') tone(420, 0.35, volume, 'sawtooth', 230);
  else if (name === 'cow') tone(120, 0.65, volume, 'sawtooth', 72);
  else if (name === 'sheep') { tone(270, 0.4, volume, 'triangle', 190); tone(310, 0.3, volume * 0.5, 'square', 210, 0.1); }
  else if (name === 'zombie') tone(95, 0.5, volume, 'sawtooth', 45);
  else if (name === 'spider' || name === 'creeper') sfx(6000, 0.3, volume, 'highpass');
  else tone(500, 0.1, volume);
}

function soundAt(name, position, volume = 0.1) {
  const alias = { sand_land: 'dig_sand' };
  if (decodedSounds[alias[name] || name]) playSample(alias[name] || name, volume, position);
}
let ambience = [], soundscapeClock = 0, caveClock = 20, lastWater = false, swimClock = 0, popClock = 0;
function stopEnvironmentSounds() {
  for (const sound of ambience) { try { sound.src.stop(); } catch (_) {} } ambience = [];
  stopSound('portal_charge');
  stopSound('cave');
}
function stopSound(name) { for (const s of liveSounds) if (s.name === name) { try { s.src.stop(); } catch (_) {} } }
function resetSoundscape() { stopEnvironmentSounds(); soundscapeClock = 0; caveClock = 15 + Math.random() * 20; lastWater = false; swimClock = popClock = 0; }
function updateSoundscape(dt) {
  if (player.inWater && !lastWater) gameSound('splash', 0.24);
  lastWater = player.inWater; swimClock -= dt; popClock -= dt; caveClock -= dt;
  if (player.inWater && Math.hypot(player.v[0], player.v[1], player.v[2]) > 0.8 && swimClock <= 0) { gameSound('swim', 0.12); swimClock = 0.6; }
  if (caveClock <= 0) {
    if (world.dimension === 'nether' || player.p[1] + 5 < world.heightAt(Math.floor(player.p[0]), Math.floor(player.p[2]))) playSample('cave', 0.1, null, world.dimension === 'nether' ? 0.85 : 1);
    caveClock = 25 + Math.random() * 30;
  }
  soundscapeClock -= dt;
  if (soundscapeClock > 0 || !decodedSounds.water) return;
  soundscapeClock = 0.75;
  let water = null, lava = null, fire = null, waterDist = Infinity, lavaDist = Infinity, fireDist = Infinity;
  const [px, py, pz] = player.p.map(Math.floor);
  for (let y = py - 3; y <= py + 3; y++) for (let z = pz - 8; z <= pz + 8; z++) for (let x = px - 8; x <= px + 8; x++) {
    const id = world.getBlock(x, y, z), dist = Math.hypot(x - px, y - py, z - pz);
    if (id === B.WATER && (world.physics.level(x, y, z) > 0 || world.getBlock(x, y - 1, z) === B.AIR) && dist < waterDist) { water = [x, y, z]; waterDist = dist; }
    if (id === B.LAVA && dist < lavaDist) { lava = [x, y, z]; lavaDist = dist; }
    if (id === B.FIRE && dist < fireDist) { fire = [x, y, z]; fireDist = dist; }
  }
  const wanted = new Set();
  const start = (name, volume, position) => {
    wanted.add(name);
    const current = ambience.find(s => s.envName === name && liveSounds.has(s));
    if (current) {
      const dx = position[0] - player.p[0], dz = position[2] - player.p[2], dist = Math.hypot(dx, position[1] - player.p[1], dz);
      current.gain.gain.setTargetAtTime(volume * Math.max(0, 1 - dist / 24) ** 2, actx.currentTime, 0.2);
      if (current.output.pan) current.output.pan.setTargetAtTime(clamp((dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / 12, -1, 1), actx.currentTime, 0.2);
    } else { const handle = playSample(name, volume, position, 1, true); if (handle) { handle.envName = name; ambience.push(handle); } }
  };
  if (water) start('water', 0.17, water);
  if (fire) start('fire', 0.13, fire);
  if (lava) { start('lava', 0.13, lava); if (popClock <= 0) { soundAt('lavapop', lava, 0.14); popClock = 2 + Math.random() * 4; } }
  const portal = world.portals.find(p => !p.invalid && Math.hypot(p.x - player.p[0], p.y - player.p[1], p.z - player.p[2]) < 12);
  if (portal) start('portal_ambient', 0.16, [portal.x, portal.y + 1, portal.z]);
  ambience = ambience.filter(s => { if (wanted.has(s.envName) && liveSounds.has(s)) return true; try { s.src.stop(); } catch (_) {} return false; });
}
