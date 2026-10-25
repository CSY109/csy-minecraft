'use strict';

// Classic GUI sprites are drawn at integer scales, with no font/emoji substitutes.
function guiSprite(image, x, y, w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(image, x, y, w, h, 0, 0, w, h); return cv.toDataURL();
}
function initGameplayFeedback() {
  const widgets = textureImages.gui_widgets;
  document.documentElement.style.setProperty('--hotbar-sprite', `url("${guiSprite(widgets, 0, 0, 182, 22)}")`);
  document.documentElement.style.setProperty('--selection-sprite', `url("${guiSprite(widgets, 0, 22, 24, 22)}")`);
  const cv = document.createElement('canvas'); cv.width = 160; cv.height = 16;
  const c = cv.getContext('2d');
  for (let i = 0; i < 10; i++) c.drawImage(textureImages['block_destroy_stage_' + i], i * 16, 0);
  gl.bindTexture(gl.TEXTURE_2D, crackTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
function drawSurvivalHUD() {
  const cv = $('vitals'), c = cv.getContext('2d'), img = textureImages.gui_icons;
  c.clearRect(0, 0, cv.width, cv.height); c.imageSmoothingEnabled = false;
  const sprite = (u, v, x, y) => c.drawImage(img, u, v, 9, 9, x, y, 9, 9);
  const health = Math.ceil(vitals.health), hunger = Math.ceil(vitals.hunger);
  for (let i = 0; i < 10; i++) {
    const hx = i * 8, fx = 173 - i * 8;
    sprite(16, 0, hx, 11); sprite(16, 27, fx, 11);
    if (health > i * 2) sprite(health >= i * 2 + 2 ? 52 : 61, 0, hx, 11);
    if (hunger > i * 2) sprite(hunger >= i * 2 + 2 ? 52 : 61, 27, fx, 11);
    if (player.eyeWater || vitals.air < 10) sprite(i < Math.ceil(vitals.air) ? 16 : 25, 18, fx, 0);
  }
  for (const [id, sourceX] of [['touchHealth', 0], ['touchHunger', 102]]) {
    const out = $(id), ctx = out.getContext('2d');
    ctx.clearRect(0, 0, out.width, out.height); ctx.drawImage(cv, sourceX, 0, 80, 20, 0, 0, 80, 20);
  }
  cv.setAttribute('aria-label', `生命 ${health}/20，饥饿 ${hunger}/20，氧气 ${Math.ceil(vitals.air)}/10`);
}
let fireOverlayStamp = '';
function drawPlayerFire() {
  const cv = $('fireOverlay'), burning = isSurvival() && !dead && vitals.burnTime > 0;
  cv.hidden = !burning;
  if (!burning) { fireOverlayStamp = ''; return; }
  const width = Math.round(180 * innerWidth / innerHeight), frame = Math.floor(gameTime * 8) % 4;
  const stamp = width + ':' + frame;
  if (stamp === fireOverlayStamp) return; fireOverlayStamp = stamp;
  cv.width = width; cv.height = 180;
  const c = cv.getContext('2d'), img = textureImages.block_fire_layer_0;
  c.imageSmoothingEnabled = false; c.globalAlpha = 0.82;
  const sourceY = frame * 16 * Math.max(1, Math.floor(img.height / 64));
  // Two classic fire sheets climb the edges; the crosshair stays unobstructed.
  for (const side of [-1, 1]) {
    c.save(); c.translate(width / 2 + side * width * 0.4, 190); c.rotate(side * 0.16);
    c.drawImage(img, 0, sourceY, 16, 16, -width * 0.21, -125, width * 0.42, 135); c.restore();
  }
}
let heldNameTimer = 0;
function showHeldName(id) {
  const e = $('heldName'); clearTimeout(heldNameTimer);
  e.textContent = (NAMES[id] || '') + (id === I.BOW ? ' · ' + NAMES[selectedArrow] : ''); e.style.opacity = id ? 1 : 0;
  heldNameTimer = setTimeout(() => { e.style.opacity = 0; }, 1600);
}

// Multiply the crack sprite into the existing block surface, as in the classic renderer.
const progCrack = program(`
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUV;
uniform mat4 uVP; uniform vec3 uOff; out vec2 vUV;
void main(){vUV=aUV;gl_Position=uVP*vec4(aPos+uOff,1.0);}`, `
in vec2 vUV; uniform sampler2D uTex; uniform float uStage; out vec4 o;
void main(){vec4 c=texture(uTex,vec2((vUV.x+uStage)/10.0,vUV.y));o=vec4(mix(vec3(1.0),c.rgb,c.a),1.0);}`,
['uVP', 'uOff', 'uTex', 'uStage']);
const crackTexture = gl.createTexture(), crackVAO = gl.createVertexArray(), crackVBO = gl.createBuffer();
gl.bindVertexArray(crackVAO); gl.bindBuffer(gl.ARRAY_BUFFER, crackVBO);
const crackVertices = [];
for (const D of DIRS) for (const k of [0, 1, 2, 0, 2, 3]) {
  const a = CA[k], b = CB[k];
  crackVertices.push(...D.o.map((n, axis) => n + D.u[axis] * a + D.v[axis] * b + D.n[axis] * 0.001), 0.001 + a * 0.998, 0.999 - b * 0.998);
}
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(crackVertices), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12); gl.bindVertexArray(null);
function drawMiningCracks(matrix) {
  if (!isSurvival() || mining.stage < 0 || !target || CROSS[target.id] || !mouseL || dead) return;
  if (mining.key !== [target.x, target.y, target.z, target.id, hotbar[sel]].join(',')) return;
  if (world.getBlock(target.x, target.y, target.z) !== target.id) return;
  gl.useProgram(progCrack); gl.uniformMatrix4fv(progCrack.u.uVP, false, matrix);
  gl.uniform3f(progCrack.u.uOff, target.x, target.y, target.z); gl.uniform1f(progCrack.u.uStage, mining.stage); gl.uniform1i(progCrack.u.uTex, 0);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, crackTexture);
  gl.enable(gl.BLEND); gl.blendFunc(gl.DST_COLOR, gl.ZERO); gl.depthMask(false);
  gl.bindVertexArray(crackVAO); gl.drawArrays(gl.TRIANGLES, 0, 36);
  gl.depthMask(true); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.bindTexture(gl.TEXTURE_2D, atlasTex);
}
function spawnBlockChips(hit, count = 3, burst = false) {
  const { x, y, z, id } = hit;
  const nx = hit.nx || 0, ny = hit.ny || 0, nz = hit.nz || 0;
  const face = nx > 0 ? 0 : nx < 0 ? 1 : nz > 0 ? 2 : nz < 0 ? 3 : ny > 0 ? 4 : 5;
  const tile = classicBlockTile(id, face);
  for (let i = 0; i < count; i++) {
    const rx = burst ? (i % 4 + 0.5) / 4 : nx ? 0.5 + nx * 0.51 : Math.random();
    const ry = burst ? (Math.floor(i / 4) % 4 + 0.5) / 4 : ny ? 0.5 + ny * 0.51 : Math.random();
    const rz = burst ? (Math.floor(i / 16) % 4 + 0.5) / 4 : nz ? 0.5 + nz * 0.51 : Math.random();
    particles.push({ x: x + rx, y: y + ry, z: z + rz,
      vx: burst ? (rx - 0.5) * 4 : nx * 0.7 + (Math.random() - 0.5),
      vy: burst ? (ry - 0.3) * 4 : ny * 0.7 + Math.random() * 1.4,
      vz: burst ? (rz - 0.5) * 4 : nz * 0.7 + (Math.random() - 0.5),
      u: (tile & 15) / 16 + Math.floor(Math.random() * 13) / 256,
      v: (tile >> 4) / 16 + Math.floor(Math.random() * 13) / 256,
      size: burst ? 0.06 + Math.random() * 0.07 : 0.035 + Math.random() * 0.035,
      life: burst ? 0.5 + Math.random() * 0.45 : 0.25 + Math.random() * 0.3 });
  }
}
