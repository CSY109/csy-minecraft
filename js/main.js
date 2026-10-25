'use strict';
// ============================================================
//  Game: player, physics, input, chunk streaming, main loop
// ============================================================

const $ = (id) => document.getElementById(id);
const DAY_LEN = 600;           // seconds per full day
const HW = 0.3, PH = 1.8;

let world = null, started = false, invOpen = false, paused = false, sessionBusy = false;
let renderDist = 8, gameTime = DAY_LEN * 0.0; // starts at morning-noon (see dayFrac)
let showDebug = false;
const keys = {};
let mouseL = false, mouseR = false, actTimer = 0, swing = 0;

const player = {
  p: [0, 80, 0], v: [0, 0, 0], yaw: 0, pitch: 0,
  onGround: false, fly: false, sneak: false, sprint: false,
  inWater: false, eyeWater: false, eyeH: 1.62, fovMul: 1, bob: 0, stepDist: 0,
};
const hotbar = [B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.PLANKS, B.LOG, B.GLASS, B.BRICK, B.SAND];
let sel = 0;
let handMesh = null, handId = -1;
let target = null;
const particles = [];

// ---------------- UI ----------------
const slotEls = [];
function buildHotbar() {
  const hb = $('hotbar'); hb.innerHTML = '';
  slotEls.length = 0;
  for (let i = 0; i < 9; i++) {
    const d = document.createElement('div'); d.className = 'slot';
    d.dataset.key = i + 1; d.setAttribute('role', 'button');
    hb.appendChild(d); slotEls.push(d);
    d.onclick = () => selectSlot(i);
  }
  refreshHotbar();
}
const iconCache = {};
function icon(id) { return iconCache[id] || (iconCache[id] = makeIcon(id)); }
function refreshHotbar() {
  slotEls.forEach((d, i) => {
    const displayId = isSurvival() && !countItem(hotbar[i]) ? 0 : hotbar[i];
    d.classList.toggle('sel', i === sel);
    d.classList.toggle('empty', !displayId);
    d.title = NAMES[hotbar[i]] || '空手';
    const old = d.querySelector('canvas'); if (old) old.remove();
    const count = d.querySelector('b'); if (count) count.remove();
    const cv = icon(displayId).cloneNode(); cv.getContext('2d').drawImage(icon(displayId), 0, 0);
    d.appendChild(cv);
    if (isSurvival() && countItem(hotbar[i]) > 1) { const n = document.createElement('b'); n.textContent = countItem(hotbar[i]); d.appendChild(n); }
  });
}
let toastT = 0;
function toast(t) { const e = $('toast'); e.textContent = t; e.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => e.style.opacity = 0, 1400); }
function selectSlot(i) { sel = (i + 9) % 9; resetMining(); cancelBow(); refreshHotbar(); showHeldName(hotbar[sel]); }
function buildInventory() {
  renderInventory(true);
}
function setInv(open) {
  if (dead) return;
  invOpen = open;
  mouseL = mouseR = false; resetMining(); cancelBow();
  resetTouchInput();
  for (const k in keys) keys[k] = false;
  $('inv').style.display = open ? 'flex' : 'none';
  if (open) { renderInventory(true); $('menu').style.display = 'none'; }
  if (open) document.exitPointerLock(); else resumeGame();
  updateTouchUI();
}

// ---------------- world helpers ----------------
function collides(x, y, z) {
  const x0 = Math.floor(x - HW), x1 = Math.floor(x + HW);
  const y0 = Math.floor(y), y1 = Math.floor(y + PH - 1e-4);
  const z0 = Math.floor(z - HW), z1 = Math.floor(z + HW);
  for (let yy = y0; yy <= y1; yy++) for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++)
    if (SOLID[world.getBlock(xx, yy, zz)]) return true;
  return false;
}
function stepAxis(a, d) {
  if (!d) return false;
  const p = player.p, n = Math.ceil(Math.abs(d) / 0.2), s = d / n;
  for (let i = 0; i < n; i++) {
    p[a] += s;
    if (collides(p[0], p[1], p[2])) {
      p[a] -= s;
      let lo = 0, hi = s;
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) / 2; p[a] += mid;
        if (collides(p[0], p[1], p[2])) hi = mid; else lo = mid;
        p[a] -= mid;
      }
      p[a] += lo;
      player.v[a] = 0;
      return true;
    }
  }
  return false;
}

function findSpawn() {
  for (let r = 0; r < 400; r += 4) {
    for (let a = 0; a < 8; a++) {
      const x = Math.round(Math.cos(a * 0.785) * r), z = Math.round(Math.sin(a * 0.785) * r);
      const cx = x >> 4, cz = z >> 4;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) world.generate(cx + dx, cz + dz);
      const y = world.surfaceY(x, z);
      if (y > SEA + 1 && !LIQ[world.getBlock(x, y, z)]) return [x + 0.5, y + 1.01, z + 0.5];
    }
  }
  return [0.5, 90, 0.5];
}

// ---------------- chunk streaming ----------------
let needed = [], lastCx = 1e9, lastCz = 1e9;
function updateNeeded() {
  const cx = Math.floor(player.p[0] / 16), cz = Math.floor(player.p[2] / 16);
  if (cx === lastCx && cz === lastCz && needed.length) return;
  lastCx = cx; lastCz = cz;
  needed = [];
  const R = renderDist + 1;
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    const d2 = dx * dx + dz * dz;
    if (d2 <= R * R + 1) needed.push([cx + dx, cz + dz, d2]);
  }
  needed.sort((a, b) => a[2] - b[2]);
  const keep = (renderDist + 3) * (renderDist + 3);
  for (const [k, c] of world.chunks) {
    const dx = c.cx - cx, dz = c.cz - cz;
    if (dx * dx + dz * dz > keep) { freeChunkMesh(c); world.chunks.delete(k); world.lighting.cache.delete(k); }
  }
}
function streamChunks(budgetMs) {
  updateNeeded();
  worldJobs.streamingWorld = world;
  if (worldJobs.available()) {
    if (worldJobs.job) return;
    const R2 = renderDist * renderDist + 1;
    // Nearby edits and visible meshes take priority over more distant generation.
    for (const n of needed) {
      const c = world.getChunk(n[0], n[1]);
      if (n[2] <= R2 && c?.gen && (c.dirty || !c.mesh) && world.canMesh(c)) { worldJobs.mesh(world, c); return; }
    }
    for (const n of needed) {
      if (n[2] > R2) continue;
      const c = world.getChunk(n[0], n[1]);
      if (!c?.gen) { worldJobs.generate(world, n[0], n[1]); return; }
      if (!c.mesh) {
        // Complete the nearest visible chunk's border first, rather than
        // generating the whole distant ring before any new ground can appear.
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
          if (!world.getChunk(c.cx + dx, c.cz + dz)?.gen) { worldJobs.generate(world, c.cx + dx, c.cz + dz); return; }
      }
    }
    for (const n of needed) {
      if (!world.getChunk(n[0], n[1])?.gen) { worldJobs.generate(world, n[0], n[1]); return; }
    }
    return;
  }
  const t0 = performance.now();
  // dirty chunks first (edits)
  for (const c of world.chunks.values()) {
    if (c.dirty && c.gen && c.mesh && world.canMesh(c)) {
      c.dirty = false; uploadChunk(c, world.meshChunk(c));
      if (performance.now() - t0 > budgetMs) return;
    }
  }
  for (const n of needed) {
    if (performance.now() - t0 > budgetMs) return;
    const c = world.getChunk(n[0], n[1]);
    if (!c || !c.gen) world.generate(n[0], n[1]);
  }
  const R2 = renderDist * renderDist + 1;
  for (const n of needed) {
    if (performance.now() - t0 > budgetMs) return;
    if (n[2] > R2) continue;
    const c = world.getChunk(n[0], n[1]);
    if (c && c.gen && !c.mesh && world.canMesh(c)) { c.dirty = false; uploadChunk(c, world.meshChunk(c)); }
  }
}

// ---------------- player update ----------------
function updatePlayer(dt) {
  const P = player, p = P.p, v = P.v;
  const fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) + touchMove.z;
  const str = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + touchMove.x;
  const shiftDown = !!(keys.ShiftLeft || keys.ShiftRight || keys.Shift || touchFlightDown);
  const controlDown = !!(keys.ControlLeft || keys.ControlRight || keys.Control);
  if (fwd <= 0 || isSurvival() && vitals.hunger <= 5) P.sprint = false; else if (controlDown) P.sprint = true;
  P.sneak = shiftDown && !P.fly;
  P.inWater = world.physics.containsWater(p[0], p[1] + 0.1, p[2]);
  P.eyeWater = world.physics.containsWater(p[0], p[1] + P.eyeH, p[2]);

  let speed = P.fly ? (P.sprint ? 22 : 11) : P.sneak ? 1.3 : P.sprint ? 5.6 : 4.3;
  if (P.inWater && !P.fly) speed *= 0.55;
  if (world.getBlock(Math.floor(p[0]), Math.floor(p[1] - 0.1), Math.floor(p[2])) === B.SOUL_SAND) speed *= 0.5;
  const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
  let dx = -sy * fwd + cy * str, dz = -cy * fwd - sy * str;
  const len = Math.hypot(dx, dz); if (len > 1) { dx /= len; dz /= len; }
  const k = Math.min(1, (P.fly ? 9 : P.onGround ? 14 : P.inWater ? 6 : 3.2) * dt);
  const flow = P.inWater && !P.fly ? world.physics.current(Math.floor(p[0]), Math.floor(p[1] + 0.1), Math.floor(p[2])) : [0, 0, 0];
  v[0] += (dx * speed + flow[0] * 1.4 - v[0]) * k; v[2] += (dz * speed + flow[2] * 1.4 - v[2]) * k;

  if (P.fly) {
    const t = ((keys.Space ? 1 : 0) - (shiftDown ? 1 : 0)) * (P.sprint ? 14 : 8.5);
    v[1] += (t - v[1]) * (1 - Math.pow(0.6, dt * 20));
  } else if (P.inWater) {
    v[1] -= 9 * dt; v[1] *= Math.max(0, 1 - 3.2 * dt);
    v[1] += flow[1] * 9 * dt;
    if (keys.Space) v[1] = Math.min(v[1] + 24 * dt, 3.6);
  } else {
    v[1] = Math.max(v[1] - 32 * dt, -78);
    if (keys.Space && P.onGround) { v[1] = 9; P.onGround = false; gameSound('jump', 0.045); }
  }

  const wasGround = P.onGround;
  const guard = (axis) => {
    if (P.sneak && wasGround && !collides(p[0], p[1] - 0.6, p[2])) return true;
    return false;
  };
  const ox = p[0], oz = p[2];
  stepAxis(0, v[0] * dt); if (guard(0)) { p[0] = ox; v[0] = 0; }
  stepAxis(2, v[2] * dt); if (guard(2)) { p[2] = oz; v[2] = 0; }
  const vy0 = v[1];
  const hitY = stepAxis(1, v[1] * dt);
  P.onGround = hitY && vy0 < 0;
  if (P.onGround && !wasGround && vy0 < -8) blockSound(world.getBlock(Math.floor(p[0]), Math.floor(p[1] - 0.1), Math.floor(p[2])), 0.1, 'land');
  if (P.onGround && P.fly) P.fly = false;
  if (p[1] < -40) {
    if (isSurvival()) damagePlayer(20, '坠入虚空');
    else { const s = findSpawn(); p[0] = s[0]; p[1] = s[1]; p[2] = s[2]; v[0] = v[1] = v[2] = 0; }
  }

  const moved = Math.hypot(p[0] - ox, p[2] - oz);
  if (P.onGround && !P.sneak) {
    P.stepDist += moved; P.bob += moved * 2.2;
    if (P.stepDist > 2.0) {
      P.stepDist = 0;
      const b = world.getBlock(Math.floor(p[0]), Math.floor(p[1] - 0.2), Math.floor(p[2]));
      blockSound(b, 0.06, 'step');
    }
  }
  const eyeT = P.sneak ? 1.37 : 1.62;
  P.eyeH += (eyeT - P.eyeH) * Math.min(1, 14 * dt);
  P.fovMul += ((P.sprint || (P.fly && P.sprint) ? 1.1 : 1) - P.fovMul) * Math.min(1, 8 * dt);
}

// ---------------- block interaction ----------------
function lookDir() {
  const cp = Math.cos(player.pitch);
  return [-cp * Math.sin(player.yaw), Math.sin(player.pitch), -cp * Math.cos(player.yaw)];
}
function eyePos() { return [player.p[0], player.p[1] + player.eyeH, player.p[2]]; }

function spawnParticles(x, y, z, id) {
  spawnBlockChips({ x, y, z, id, ny: 1 }, 64, true);
}

function breakBlock() {
  if (!target) return;
  const { x, y, z, id } = target;
  if (isSurvival() && id === B.BEDROCK) return;
  if (isSurvival() && harvestable(id, hotbar[sel])) addItem(blockDrop(id));
  if (isSurvival() && id === B.SNOWGRASS && ITEMS[hotbar[sel]]?.tool === 'shovel') addItem(B.SNOW);
  spawnParticles(x, y, z, id);
  blockSound(id, 0.25);
  world.setBlock(x, y, z, 0);
  const above = world.getBlock(x, y + 1, z);
  if (CROSS[above]) world.setBlock(x, y + 1, z, 0);
  remeshAt(x, z);
  swing = 1;
}
function remeshAt(x, z) {
  if (worldJobs.available()) return;
  const c = world.getChunk(x >> 4, z >> 4);
  if (c && c.dirty && world.canMesh(c)) { c.dirty = false; uploadChunk(c, world.meshChunk(c)); }
}
function placeBlock() {
  if (useHeldItem()) return;
  if (!target) return;
  const id = hotbar[sel];
  if (!id || ITEMS[id] || isSurvival() && !countItem(id)) return;
  let x = target.x + target.nx, y = target.y + target.ny, z = target.z + target.nz;
  if (CROSS[target.id]) { x = target.x; y = target.y; z = target.z; }
  const cur = world.getBlock(x, y, z);
  if (cur && !LIQ[cur] && !CROSS[cur]) return;
  if (y < 0 || y >= CH) return;
  if (!world.getChunk(x >> 4, z >> 4)?.gen) return;
  if (SOLID[id]) {
    const p = player.p;
    if (x + 1 > p[0] - HW && x < p[0] + HW && z + 1 > p[2] - HW && z < p[2] + HW && y + 1 > p[1] && y < p[1] + PH) return;
    if (mobs.some(m => { const d = MOB_TYPES[m.type], r = d.width / 2; return m.hp > 0 && x + 1 > m.x - r && x < m.x + r && z + 1 > m.z - r && z < m.z + r && y + 1 > m.y && y < m.y + d.height; })) return;
  }
  if (CROSS[id]) {
    const below = world.getBlock(x, y - 1, z);
    if (id === B.TORCH ? !SOLID[below] : below !== B.GRASS && below !== B.DIRT && below !== B.SNOWGRASS) return;
  }
  world.setBlock(x, y, z, id);
  spendItem(id);
  if (id === B.PUMPKIN) trySummonGolem(x, y, z);
  blockSound(id, 0.2, 'place');
  remeshAt(x, z);
  swing = 1;
}
function pickBlock() {
  if (!target) return;
  const id = target.id;
  if (isSurvival() && !countItem(id)) { toast('背包中没有' + NAMES[id]); return; }
  const ex = hotbar.indexOf(id);
  if (ex >= 0) sel = ex; else hotbar[sel] = id;
  refreshHotbar(); toast(NAMES[id]);
}

// ---------------- time / sky ----------------
const sky = { zen: [0, 0, 0], hor: [0, 0, 0], sun: [0, 1, 0], d: 1, glow: 0, night: 0 };
function updateSky() {
  if (world?.dimension === 'nether') { Object.assign(sky, { zen: [0.13, 0.025, 0.02], hor: [0.22, 0.045, 0.025], sun: [0, -1, 0], d: 0.65, glow: 0, night: 0 }); return; }
  const frac = ((gameTime / DAY_LEN) + 0.25) % 1;
  const a = frac * Math.PI * 2;
  let sx = Math.cos(a), sy = Math.sin(a), sz = 0.22;
  const l = Math.hypot(sx, sy, sz); sx /= l; sy /= l; sz /= l;
  sky.sun = [sx, sy, sz];
  const d = smoothstep(-0.14, 0.22, sy);
  sky.d = d;
  const mix3 = (A, Bc, t) => [lerp(A[0], Bc[0], t), lerp(A[1], Bc[1], t), lerp(A[2], Bc[2], t)];
  sky.zen = mix3([0.01, 0.015, 0.06], [0.44, 0.63, 1.0], d);
  let hor = mix3([0.03, 0.04, 0.10], [0.74, 0.85, 1.0], d);
  const glow = Math.exp(-Math.pow(sy * 4.5, 2)) * 0.9;
  sky.glow = glow;
  hor = mix3(hor, [1.0, 0.52, 0.28], glow * 0.65);
  sky.hor = hor;
  sky.night = 1 - smoothstep(-0.2, 0.05, sy);
}

// ---------------- matrices ----------------
const proj = M4.create(), view = M4.create(), vp = M4.create(), handM = M4.create();
const frustum = new Float32Array(24);
let lastW = 0, lastH = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, isTouchMode() ? 1 : 2);
  const w = Math.floor(canvas.clientWidth * dpr), h = Math.floor(canvas.clientHeight * dpr);
  if (w !== lastW || h !== lastH) { canvas.width = w; canvas.height = h; lastW = w; lastH = h; }
}

function drawWorld(t) {
  resize();
  const W = canvas.width, Hh = canvas.height;
  gl.viewport(0, 0, W, Hh);
  const eye = eyePos();
  const fov = Number($('fov').value) * Math.PI / 180 * player.fovMul;
  const aspect = W / Hh;
  M4.perspective(proj, fov, aspect, 0.06, 4000);
  M4.identity(view);
  M4.rotX(view, view, -player.pitch); M4.rotY(view, view, -player.yaw);
  M4.translate(view, view, -eye[0], -eye[1], -eye[2]);
  M4.mul(vp, proj, view);
  extractFrustum(vp, frustum);

  const cy = Math.cos(player.yaw), sy = Math.sin(player.yaw), cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
  const F = [-cp * sy, sp, -cp * cy], R = [cy, 0, -sy], U = [sp * sy, cp, sp * cy];

  let fogC = sky.hor.slice(), fogN = renderDist * 16 * 0.55, fogF = renderDist * 16 * 0.98;
  if (world.dimension === 'nether') { fogN = 8; fogF = Math.min(60, fogF); }
  if (player.eyeWater) { const k = 0.25 + 0.75 * sky.d; fogC = [0.05 * k, 0.16 * k, 0.4 * k]; fogN = 0.5; fogF = 20; }
  const dayL = lerp(0.045, 1.0, sky.d);
  const tint = [lerp(0.55, 1, sky.d), lerp(0.65, 1, sky.d), lerp(1.0, 1, sky.d)];

  gl.clearColor(fogC[0], fogC[1], fogC[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // sky
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
  gl.useProgram(progSky);
  const u = progSky.u;
  gl.uniform3fv(u.uR, R); gl.uniform3fv(u.uU, U); gl.uniform3fv(u.uF, F);
  gl.uniform2f(u.uTan, Math.tan(fov / 2) * aspect, Math.tan(fov / 2));
  const zen = player.eyeWater ? fogC : sky.zen, hor = player.eyeWater ? fogC : sky.hor;
  gl.uniform3fv(u.uZen, zen); gl.uniform3fv(u.uHor, hor); gl.uniform3fv(u.uSun, sky.sun);
  gl.uniform1f(u.uNight, player.eyeWater ? 0 : sky.night); gl.uniform1f(u.uGlow, player.eyeWater ? 0 : sky.glow);
  gl.bindVertexArray(emptyVAO);
  if (world.dimension !== 'nether') gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlasTex);

  const setWorldUniforms = (prog) => {
    const q = prog.u;
    gl.uniformMatrix4fv(q.uVP, false, vp); gl.uniform3fv(q.uCam, eye); gl.uniform1i(q.uTex, 0);
    gl.uniform1f(q.uDay, dayL); gl.uniform3fv(q.uTint, tint); gl.uniform3fv(q.uFog, fogC);
    gl.uniform1f(q.uAmbient, world.dimension === 'nether' ? 0.12 : 0.035);
    if (q.uTime) gl.uniform1f(q.uTime, t);
    gl.uniform2f(q.uFogRange, fogN, fogF);
  };

  const visible = [];
  for (const c of world.chunks.values()) {
    if (!c.mesh) continue;
    const ox = c.cx * 16, oz = c.cz * 16;
    if (!aabbInFrustum(frustum, ox, 0, oz, ox + 16, Math.min(CH, c.maxY + 2), oz + 16)) continue;
    visible.push(c);
  }

  gl.useProgram(progWorld); setWorldUniforms(progWorld);
  for (const c of visible) {
    if (!c.mesh.o) continue;
    gl.uniform3f(progWorld.u.uOff, c.cx * 16, 0, c.cz * 16);
    gl.bindVertexArray(c.mesh.o.vao);
    gl.drawElements(gl.TRIANGLES, c.mesh.o.n, gl.UNSIGNED_INT, 0);
  }

  drawFallingBlocks();
  drawMobs(vp, eye, dayL, fogC, fogN, fogF);
  drawBurningMobs(vp, eye, fogC, fogN, fogF);

  // selection outline
  if (target) {
    gl.useProgram(progLine);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix4fv(progLine.u.uVP, false, vp);
    gl.uniform3f(progLine.u.uOff, target.x, target.y, target.z);
    gl.bindVertexArray(lineVAO);
    gl.drawArrays(gl.LINES, 0, 24);
  }

  drawMiningCracks(vp);

  // particles
  if (particles.length) {
    const data = new Float32Array(particles.length * 6);
    particles.forEach((p, i) => { data.set([p.x, p.y, p.z, p.u, p.v, p.size], i * 6); });
    gl.useProgram(progPart);
    gl.uniformMatrix4fv(progPart.u.uVP, false, vp);
    gl.uniform1f(progPart.u.uPx, Hh / (2 * Math.tan(fov / 2)));
    gl.uniform1i(progPart.u.uTex, 0); gl.uniform1f(progPart.u.uLight, dayL);
    gl.bindVertexArray(partVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, partVBO);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.POINTS, 0, particles.length);
  }

  // water
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.CULL_FACE);
  gl.useProgram(progWater); setWorldUniforms(progWater);
  gl.uniform1f(progWater.u.uTime, t);
  for (const c of visible) {
    if (!c.mesh.w) continue;
    gl.uniform3f(progWater.u.uOff, c.cx * 16, 0, c.cz * 16);
    gl.bindVertexArray(c.mesh.w.vao);
    gl.drawElements(gl.TRIANGLES, c.mesh.w.n, gl.UNSIGNED_INT, 0);
  }

  // clouds
  gl.useProgram(progCloud);
  gl.uniformMatrix4fv(progCloud.u.uVP, false, vp);
  gl.uniform2f(progCloud.u.uCenter, eye[0], eye[2]);
  gl.uniform1f(progCloud.u.uY, 120);
  gl.uniform2f(progCloud.u.uScroll, (gameTime * 1.6) / (12 * 128), 0);
  gl.uniform1f(progCloud.u.uDayF, lerp(0.25, 1, sky.d));
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cloudTex);
  gl.uniform1i(progCloud.u.uTex, 0);
  gl.bindVertexArray(emptyVAO);
  if (world.dimension !== 'nether') gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  gl.disable(gl.BLEND);

  drawHand(dayL, tint, t);
  drawPlayerFire();
}

function applyBowHandPose(matrix, bobX = 0, bobY = 0) {
  const aim = smoothstep(0, 1, bow.raise);
  const kick = bow.recoil > 0 ? Math.sin((1 - bow.recoil / 0.18) * Math.PI) : 0;
  // The classic sprite's arrow points diagonally up-left. Stand the bow upright,
  // then turn that arrow into the scene instead of presenting the sprite like a sword.
  M4.translate(matrix, matrix, lerp(0.57, 0.39, aim) + bobX * (1 - aim * 0.8),
    lerp(-0.30, -0.04, aim) - bobY * (1 - aim * 0.8) - kick * 0.012,
    lerp(-1.18, -1.08, aim) + kick * 0.035);
  M4.rotY(matrix, matrix, lerp(-0.72, -1.2, aim));
  M4.rotX(matrix, matrix, lerp(0.08, 0, aim) + kick * 0.025);
  M4.rotZ(matrix, matrix, Math.PI / 4 + lerp(-0.12, 0, aim));
  const scale = 0.66;
  M4.scale(matrix, matrix, scale, scale, scale);
  M4.translate(matrix, matrix, -0.5, -0.5, -0.5);
}

function drawHand(dayL, tint, t) {
  const id = isSurvival() && !countItem(hotbar[sel]) ? 0 : hotbar[sel];
  const drawing = id === I.BOW && bow.active;
  const tile = drawing ? BOW_PULL_TILES[bow.elapsed >= 0.9 ? 2 : bow.elapsed >= 0.45 ? 1 : 0] : TOP[id];
  const meshKey = id + ':' + tile;
  if (meshKey !== handId) { if (handMesh) freeMeshBuf(handMesh); handMesh = buildBlockMesh(id, tile); handId = meshKey; }
  if (!handMesh) return;
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.CULL_FACE);
  const aspect = canvas.width / canvas.height;
  M4.perspective(handM, 70 * Math.PI / 180, aspect, 0.05, 20);
  const sw = Math.sin(Math.sqrt(Math.max(0, 1 - swing)) * Math.PI);
  const swingOn = swing > 0;
  const bobX = Math.sin(player.bob) * 0.02 * (player.onGround ? 1 : 0), bobY = Math.abs(Math.cos(player.bob)) * 0.02 * (player.onGround ? 1 : 0);
  if (id === I.BOW) {
    applyBowHandPose(handM, bobX, bobY);
  } else {
    M4.translate(handM, handM, 0.62 + bobX - (swingOn ? sw * 0.3 : 0), -0.62 - bobY - (swingOn ? sw * 0.15 : 0), -1.0 - (swingOn ? sw * 0.25 : 0));
    M4.rotY(handM, handM, -0.6);
    M4.rotX(handM, handM, 0.25 - (swingOn ? sw * 0.9 : 0));
    const s = ITEMS[id] ? (ITEMS[id].tool ? 0.85 : 0.65) : CROSS[id] ? 0.55 : 0.4;
    M4.scale(handM, handM, s, s, s);
    M4.translate(handM, handM, -0.5, -0.5, -0.5);
  }
  gl.useProgram(progWorld);
  const q = progWorld.u;
  gl.uniformMatrix4fv(q.uVP, false, handM);
  gl.uniform3f(q.uOff, 0, 0, 0); gl.uniform3f(q.uCam, 0, 0, 0);
  gl.uniform1f(q.uDay, Math.max(dayL, 0.65)); gl.uniform3fv(q.uTint, [Math.max(tint[0], 0.8), Math.max(tint[1], 0.85), 1]);
  gl.uniform1f(q.uAmbient, 0.65);
  gl.uniform2f(q.uFogRange, 1e5, 1e6);
  gl.bindVertexArray(handMesh.vao);
  gl.drawElements(gl.TRIANGLES, handMesh.n, gl.UNSIGNED_INT, 0);
}

// ---------------- particles ----------------
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.vy -= (p.gravity ?? 18) * dt;
    const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
    if (SOLID[world.getBlock(Math.floor(p.x), Math.floor(ny), Math.floor(p.z))]) { p.vy = 0; p.vx *= 0.7; p.vz *= 0.7; }
    else p.y = ny;
    p.x = nx; p.z = nz;
  }
}

// ---------------- main loop ----------------
let last = 0, fpsAcc = 0, fpsN = 0, fps = 0, timeScale = 1;
function frame(now) {
  requestAnimationFrame(frame);
  if (!started || sessionBusy) return;
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
  fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  const active = hasGameFocus();
  if (active) {
    updateTouchFlight(dt);
    updatePlayer(dt);
    const e = eyePos(), d = lookDir();
    target = world.raycast(...e, ...d, isSurvival() ? 5 : 6);
    mobTarget = findMobTarget(e, d, 4.5, target ? target.t : Infinity);
    updateBow(dt);
    if (bow.active) resetMining();
    else if (mouseL && mobTarget) { resetMining(); attackMob(); } else updateMining(dt);
    if (mouseR && ITEMS[hotbar[sel]]?.tool !== 'bow') { actTimer -= dt; if (actTimer <= 0) { placeBlock(); actTimer = 0.35; } }
    updateVitals(dt);
    if (!dead) updateMobs(dt);
    if (!dead) { world.physics.update(dt); updatePortals(dt); updateSoundscape(dt); }
    gameTime += dt * timeScale;
    updateParticles(dt);
  } else {
    resetMining(); cancelBow();
  }
  if (swing > 0) swing = Math.max(0, swing - dt * 4.5);
  updateBowPose(dt);
  updateSky();
  streamChunks(active ? 6 : 12);

  const e = eyePos(), d = lookDir();
  const hit = world.raycast(e[0], e[1], e[2], d[0], d[1], d[2], isSurvival() ? 5 : 6);
  target = hit;
  mobTarget = findMobTarget(e, d, 4.5, target ? target.t : Infinity);
  updateHUD();
  updateTouchUI();
  if (invOpen) renderInventory();
  drawWorld(now / 1000);
  $('uw').style.display = player.eyeWater ? 'block' : 'none';

  if (showDebug) {
    const p = player.p;
    const fm = Math.round(((((gameTime / DAY_LEN) + 0.25) % 1) * 24 + 6) % 24 * 60);
    $('debug').textContent =
      'Minecraft Web (WebGL2)\n' + fps.toFixed(0) + ' fps  chunks: ' + world.chunks.size +
      '\nXYZ: ' + p[0].toFixed(2) + ' / ' + p[1].toFixed(2) + ' / ' + p[2].toFixed(2) +
      '\nChunk: ' + (Math.floor(p[0]) >> 4) + ', ' + (Math.floor(p[2]) >> 4) +
      '\nFacing yaw ' + (((-player.yaw * 180 / Math.PI) % 360 + 360) % 360).toFixed(0) + ' pitch ' + (player.pitch * 180 / Math.PI).toFixed(0) +
      '\nTime: ' + String(Math.floor(fm / 60) % 24).padStart(2, '0') + ':' + String(fm % 60).padStart(2, '0') +
      '\nSeed: ' + world.seed + (player.fly ? '\n飞行中' : '') +
      '\n维度: ' + (world.dimension === 'nether' ? '下界' : '主世界') +
      (target ? '\n目标: ' + NAMES[target.id] + ' (' + target.x + ',' + target.y + ',' + target.z + ')' : '');
  }
}

// ---------------- input ----------------
let lastSpace = 0;
let mouseLookReady = false;
function applyMouseLook(e) {
  if (document.pointerLockElement !== canvas || dead || invOpen) return;
  // Lock acquisition can report the cursor's move to the window centre as input.
  if (!mouseLookReady) { mouseLookReady = true; return; }
  const dx = e.movementX, dy = e.movementY;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  // Discard cursor-warp samples; do not clamp or smooth ordinary mouse motion.
  if (Math.abs(dx) > Math.max(240, window.innerWidth / 2) || Math.abs(dy) > Math.max(240, window.innerHeight / 2)) return;
  const sensitivity = Number($('sensitivity').value) / 100;
  player.yaw -= dx * 0.0022 * sensitivity;
  player.pitch = clamp(player.pitch - dy * 0.0022 * sensitivity, -1.5533, 1.5533);
}
document.addEventListener('keydown', (e) => {
  if (!started) return;
  if (document.querySelector('dialog[open]')) return;
  if (document.pointerLockElement !== canvas && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) && e.code !== 'Escape') return;
  if (e.code === 'F3') { e.preventDefault(); showDebug = !showDebug; $('debug').style.display = showDebug ? 'block' : 'none'; return; }
  if (e.code === 'KeyE') { e.preventDefault(); if (!e.repeat) setInv(!invOpen); return; }
  if (invOpen && e.code === 'Escape') { e.preventDefault(); setInv(false); return; }
  if (document.pointerLockElement !== canvas) return;
  if (e.code === 'Escape') { e.preventDefault(); document.exitPointerLock(); return; }
  if (['Space', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (keys[e.code]) { return; }
  keys[e.code] = true;
  if (e.code === 'KeyR' && hotbar[sel] === I.BOW) selectArrow(selectedArrow === I.ARROW ? I.EXPLOSIVE_ARROW : I.ARROW);
  if (e.code === 'Space') {
    const n = performance.now();
    if (!isSurvival() && n - lastSpace < 300) { player.fly = !player.fly; player.v[1] = 0; }
    lastSpace = n;
  }
  if (!isSurvival() && e.code === 'KeyT') timeScale = timeScale === 1 ? 40 : 1, toast(timeScale > 1 ? '时间加速' : '时间正常');
  if (e.code.startsWith('Digit')) { const n = parseInt(e.code.slice(5)); if (n >= 1 && n <= 9) selectSlot(n - 1); }
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => {
  resetTouchInput();
  if (isTouchMode() && started) pauseGame();
  mouseLookReady = false;
  for (const k in keys) keys[k] = false; mouseL = mouseR = false; cancelBow();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
});
window.addEventListener('resize', () => { mouseLookReady = false; });
document.addEventListener('mousemove', applyMouseLook);
canvas.addEventListener('mousedown', (e) => {
  if (isTouchMode()) return;
  if (!started) return;
  if (document.pointerLockElement !== canvas) { if (!invOpen) canvas.requestPointerLock(); return; }
  e.preventDefault();
  if (dead) return;
  if (e.button === 0) { mouseL = true; actTimer = 0; if (mobTarget && !bow.active) attackMob(); }
  else if (e.button === 2) { mouseR = true; placeBlock(); actTimer = 0.25; }
  else if (e.button === 1) pickBlock();
});
document.addEventListener('mouseup', (e) => { if (e.button === 0) { mouseL = false; resetMining(); } if (e.button === 2) { releaseBow(); mouseR = false; } });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('wheel', (e) => { if (document.pointerLockElement === canvas) selectSlot(sel + (e.deltaY > 0 ? 1 : -1)); }, { passive: true });
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (isTouchMode()) return;
  mouseLookReady = false;
  if (sessionBusy) return;
  if (!locked) { for (const k in keys) keys[k] = false; mouseL = mouseR = false; resetMining(); cancelBow(); }
  if (!locked) stopEnvironmentSounds();
  document.body.classList.toggle('playing', started && !dead);
  if (dead) { $('menu').style.display = 'none'; return; }
  if (!locked && started && !invOpen) { $('menu').style.display = 'flex'; $('play').textContent = '继续游戏'; paused = true; queueGameSave(); }
  if (locked) { $('menu').style.display = 'none'; paused = false; }
  if (locked) { canvas.tabIndex = -1; canvas.focus({ preventScroll: true }); }
});

$('rd').oninput = () => { $('rdv').textContent = $('rd').value; };
$('play').onclick = () => {
  requestMobileLandscape();
  initAudio();
  if (started) { renderDist = parseInt($('rd').value); lastCx = 1e9; resumeGame(); return; }
  startOrContinueGame().catch(showSaveError);
};

let startupStats = null;
let gameGraphicsReady = false;
async function ensureGameGraphics() {
  if (gameGraphicsReady) return;
  await texturesReady;
  applyClassicAtlas(); initMobTextures(); initGameplayFeedback(); gameGraphicsReady = true;
}
async function startGame() {
  const begin = performance.now();
  renderDist = parseInt($('rd').value);
  world = new World(seedFromString($('seed').value));
  // Terrain and the first mesh build in the worker while textures initialise.
  const bootstrap = worldJobs.bootstrap(world).catch(() => null);
  await ensureGameGraphics();
  const result = await bootstrap;
  if (result) player.p = result.spawn;
  else {
    const data = await prepareStarterWorld(world, () => new Promise(resolve => setTimeout(resolve, 0)));
    player.p = installStarterWorld(world, data);
  }
  initSurvival();
  resetDimensions(); resetSoundscape();
  gameTime = 0;
  lastCx = 1e9;
  buildHotbar(); // The full inventory is constructed when it is first opened.
  naturalSpawn(true);
  started = true;
  startupStats = { elapsed: performance.now() - begin, chunks: world.chunks.size, background: !!result, ...result?.timings };
  document.body.classList.add('playing');
  $('loading').style.display = 'none';
  resumeGame();
  last = performance.now();
  setTimeout(loadSounds, 750);
}

requestAnimationFrame(frame);
bindSurvivalUI();
