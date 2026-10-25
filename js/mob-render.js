'use strict';

// Model dimensions and UV cuboid nets use Minecraft's 1/16-block pixel units.
const progMob = program(`
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUV;
layout(location=2) in float aShade; layout(location=3) in float aFlash;
uniform mat4 uVP; uniform vec3 uCam;
out vec2 vUV; out float vShade; out float vFlash; out float vDist;
void main(){vUV=aUV;vShade=aShade;vFlash=aFlash;vDist=length(aPos-uCam);gl_Position=uVP*vec4(aPos,1.0);}`, `
in vec2 vUV; in float vShade; in float vFlash; in float vDist;
uniform sampler2D uTex; uniform float uDay; uniform vec3 uFog; uniform vec2 uFogRange; out vec4 o;
void main(){
  vec4 tex=texture(uTex,vUV); if(tex.a<0.5) discard;
  vec3 col=tex.rgb;
  if(vFlash>1.5) col=mix(col,vec3(1.0),0.8);
  else if(vFlash>0.5) col=mix(col,vec3(1.0,0.12,0.08),0.6);
  col*=vShade;
  o=vec4(mix(col,uFog,smoothstep(uFogRange.x,uFogRange.y,vDist)),1.0);
}`, ['uVP', 'uCam', 'uTex', 'uDay', 'uFog', 'uFogRange']);
const mobVAO = gl.createVertexArray(), mobVBO = gl.createBuffer(), mobTexture = gl.createTexture();
gl.bindVertexArray(mobVAO); gl.bindBuffer(gl.ARRAY_BUFFER, mobVBO);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 12);
gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 20);
gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 28, 24);
gl.bindVertexArray(null);
const skinRects = Object.create(null), SKIN_SIZE = 512;
let mobTexturesReady = false;
function initMobTextures() {
  if (mobTexturesReady) return;
  const cv = document.createElement('canvas'); cv.width = cv.height = SKIN_SIZE;
  const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
  let x = 2, y = 2, rowHeight = 0;
  for (const [key, img] of Object.entries(textureImages).filter(([k]) => k.startsWith('entity_') || k.startsWith('block_pumpkin'))) {
    if (x + img.width + 2 > SKIN_SIZE) { y += rowHeight + 4; x = 2; rowHeight = 0; }
    skinRects[key.replace('entity_', '')] = [x, y, img.width, img.height];
    c.drawImage(img, x, y); x += img.width + 4; rowHeight = Math.max(rowHeight, img.height);
  }
  c.fillStyle = '#f4f8fa'; c.fillRect(500, 500, 4, 4); skinRects.white = [500, 500, 4, 4];
  c.fillStyle = '#795337'; c.fillRect(506, 500, 4, 4); skinRects.wood = [506, 500, 4, 4];
  c.fillStyle = '#cf4436'; c.fillRect(500, 506, 4, 4); skinRects.explosive = [500, 506, 4, 4];
  gl.bindTexture(gl.TEXTURE_2D, mobTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  mobTexturesReady = true;
}

function drawMobs(matrix, eye, light, fog, near, far) {
  if (!mobTexturesReady) return;
  const vertices = [];
  const lightCache = new Map();
  // Each face samples its own part of the original unwrapped skin.
  function box(m, skin, uv, pos, size, options = {}) {
    const [w, h, d] = size, [u, v] = uv, inflate = options.inflate || 0;
    const faces = [[u + d + w, v + d, d, h], [u, v + d, d, h],
      [u + d, v + d, w, h], [u + 2 * d + w, v + d, w, h], [u + d, v, w, d], [u + d + w, v, w, d]];
    const pivot = options.pivot || [pos[0], pos[1] + h, pos[2]], rot = options.rot || [0, 0, 0];
    const cos = rot.map(Math.cos), sin = rot.map(Math.sin), scale = options.scale || 1;
    const mc = Math.cos(m.yaw), ms = Math.sin(m.yaw);
    if (!lightCache.has(m)) {
      const x = Math.floor(m.x), y = Math.floor(m.y + (MOB_TYPES[m.type]?.height || 0.2) * 0.65), z = Math.floor(m.z);
      lightCache.set(m, Math.max(world.heightAt(x, z) < y ? light : 0.035, world.lighting.sample(x, y, z) / 15));
    }
    const deathAngle = mobDeathAngle(m), dc = Math.cos(deathAngle), ds = Math.sin(deathAngle);
    const flash = m.hurt > 0 ? 1 : m.fuse > 0 && Math.floor(m.fuse * 9) % 2 ? 2 : 0;
    for (let f = 0; f < 6; f++) {
      const D = DIRS[f], rect = options.faces ? options.faces[f] : [skin, ...faces[f]];
      const [key, tx, ty, tw, th] = rect, origin = skinRects[key];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const a = CA[k], b = CB[k];
        let lx = pos[0] + (D.o[0] + D.u[0] * a + D.v[0] * b - 0.5) * (w + inflate * 2) - pivot[0];
        let ly = pos[1] - inflate + (D.o[1] + D.u[1] * a + D.v[1] * b) * (h + inflate * 2) - pivot[1];
        let lz = pos[2] + (D.o[2] + D.u[2] * a + D.v[2] * b - 0.5) * (d + inflate * 2) - pivot[2];
        [ly, lz] = [ly * cos[0] - lz * sin[0], ly * sin[0] + lz * cos[0]];
        [lx, lz] = [lx * cos[1] + lz * sin[1], -lx * sin[1] + lz * cos[1]];
        [lx, ly] = [lx * cos[2] - ly * sin[2], lx * sin[2] + ly * cos[2]];
        lx = (lx + pivot[0]) * scale / 16; ly = (ly + pivot[1]) * scale / 16; lz = (lz + pivot[2]) * scale / 16;
        if (m.dying) [lx, ly] = [lx * dc - ly * ds, lx * ds + ly * dc + MOB_TYPES[m.type].width * ds / 2];
        const uu = options.mirror ? 1 - a : a;
        vertices.push(m.x + lx * mc + lz * ms, m.y + ly, m.z - lx * ms + lz * mc,
          (origin[0] + tx + 0.01 + uu * (tw - 0.02)) / SKIN_SIZE,
          (origin[1] + ty + 0.01 + (1 - b) * (th - 0.02)) / SKIN_SIZE, D.shade * lightCache.get(m), flash);
      }
    }
  }
  function leg(m, skin, uv, x, z, height, phase, options = {}) {
    box(m, skin, uv, [x, 0, z], [4, height, 4], { pivot: [x, height, z], rot: [Math.sin(m.walk + phase) * 0.65, 0, 0], ...options });
  }
  function pumpkin(m) {
    const face = key => ['block_pumpkin_' + key, 0, 0, 16, 16];
    box(m, '', [0, 0], [0, 20, 0], [10, 10, 10], { faces: [face('side'), face('side'), face('face_off'), face('side'), face('top'), face('top')] });
  }
  for (const m of mobs) {
    if (m.hp <= 0 && !m.dying || Math.hypot(m.x - eye[0], m.z - eye[2]) > far) continue;
    const skin = m.type;
    if (m.type === 'pig') {
      box(m, skin, [28, 8], [0, 2, 0], [10, 16, 8], { pivot: [0, 10, 0], rot: [Math.PI / 2, 0, 0] });
      box(m, skin, [0, 0], [0, 8, 10], [8, 8, 8]);
      box(m, skin, [16, 16], [0, 9, 14.5], [4, 3, 1]);
      for (const [x, z, phase] of [[-3, -5, 0], [3, -5, Math.PI], [-3, 5, Math.PI], [3, 5, 0]]) leg(m, skin, [0, 16], x, z, 6, phase);
    } else if (m.type === 'cow') {
      box(m, skin, [18, 4], [0, 8, -1], [12, 18, 10], { pivot: [0, 17, -1], rot: [Math.PI / 2, 0, 0] });
      box(m, skin, [0, 0], [0, 16, 11], [8, 8, 6]);
      for (const x of [-4, 4]) box(m, skin, [22, 0], [x, 23, 11], [1, 3, 1]);
      box(m, skin, [52, 0], [0, 10, -1], [4, 2, 6]);
      for (const [x, z, phase] of [[-4, -7, 0], [4, -7, Math.PI], [-4, 7, Math.PI], [4, 7, 0]]) leg(m, skin, [0, 16], x, z, 12, phase);
    } else if (m.type === 'sheep') {
      box(m, skin, [28, 8], [0, 7, 0], [8, 16, 6], { pivot: [0, 15, 0], rot: [Math.PI / 2, 0, 0] });
      box(m, skin, [0, 0], [0, 16, 10], [6, 6, 8]);
      box(m, 'sheep_fur', [28, 8], [0, 7, 0], [8, 16, 6], { inflate: 1.75, pivot: [0, 15, 0], rot: [Math.PI / 2, 0, 0] });
      box(m, 'sheep_fur', [0, 0], [0, 16, 8], [6, 6, 6], { inflate: 0.6 });
      for (const [x, z, phase] of [[-3, -5, 0], [3, -5, Math.PI], [-3, 5, Math.PI], [3, 5, 0]]) {
        const rot = [Math.sin(m.walk + phase) * 0.65, 0, 0], pivot = [x, 12, z];
        box(m, skin, [0, 16], [x, 0, z], [4, 12, 4], { rot, pivot });
        box(m, 'sheep_fur', [0, 16], [x, 6, z], [4, 6, 4], { inflate: 0.5, rot, pivot });
      }
    } else if (m.type === 'zombie') {
      const scale = 0.94;
      box(m, skin, [0, 0], [0, 24, 0], [8, 8, 8], { scale });
      box(m, skin, [16, 16], [0, 12, 0], [8, 12, 4], { scale });
      leg(m, skin, [0, 16], -2, 0, 12, 0, { scale }); leg(m, skin, [0, 16], 2, 0, 12, Math.PI, { scale, mirror: true });
      for (const x of [-6, 6]) box(m, skin, [40, 16], [x, 12, 0], [4, 12, 4], { scale, mirror: x > 0, pivot: [x, 22, 0], rot: [-Math.PI / 2 + Math.sin(m.walk) * 0.04, 0, 0] });
    } else if (m.type === 'creeper') {
      box(m, skin, [0, 0], [0, 18, 0], [8, 8, 8]);
      box(m, skin, [16, 16], [0, 6, 0], [8, 12, 4]);
      for (const [x, z, phase] of [[-2, -4, 0], [2, -4, Math.PI], [-2, 4, Math.PI], [2, 4, 0]]) leg(m, skin, [0, 16], x, z, 6, phase);
    } else if (m.type === 'spider') {
      box(m, skin, [0, 0], [0, 5, -9], [10, 8, 12]);
      box(m, skin, [0, 0], [0, 6, 0], [6, 6, 6]);
      box(m, skin, [32, 4], [0, 5, 7], [8, 8, 8]);
      for (const sign of [-1, 1]) for (let k = 0; k < 4; k++) {
        const z = -3 + k * 2, pivot = [sign * 3, 8, z];
        box(m, skin, [18, 0], [sign * 11, 7, z], [16, 2, 2], {
          pivot, rot: [0, sign * (-0.65 + k * 0.43 + Math.sin(m.walk + k) * 0.15), -sign * (0.35 + Math.sin(m.walk + k * Math.PI) * 0.12)] });
      }
    } else if (m.type === 'iron_golem') {
      box(m, skin, [0, 40], [0, 21, 0], [18, 12, 11]);
      box(m, skin, [0, 70], [0, 16, 0], [9, 5, 6]);
      box(m, skin, [0, 0], [0, 33, 2.5], [8, 10, 8]);
      box(m, skin, [24, 0], [0, 31, 7.5], [2, 4, 2]);
      for (const sign of [-1, 1]) {
        const angle = Math.sin(m.walk) * 0.45 * sign;
        box(m, skin, sign < 0 ? [0, 22] : [37, 0], [sign * 4, 0, 0], [6, 16, 5], { pivot: [sign * 4, 16, 0], rot: [angle, 0, 0] });
        box(m, skin, [60, 21], [sign * 11, 3, 0], [4, 30, 6], { mirror: sign > 0, pivot: [sign * 11, 31, 0], rot: [m.attack > 0.75 ? -1.5 : -angle * 0.65, 0, 0] });
      }
    } else if (m.type === 'snow_golem') {
      box(m, skin, [0, 36], [0, 0, 0], [12, 12, 12]);
      box(m, skin, [0, 16], [0, 11, 0], [10, 10, 10]);
      box(m, skin, [0, 0], [0, 20, 0], [8, 8, 8]); pumpkin(m);
      for (const sign of [-1, 1]) box(m, skin, [32, 0], [sign * 10, 19, 0], [12, 2, 2], { pivot: [sign * 4, 20, 0], rot: [0, 0, sign * 0.45] });
    }
  }
  for (const p of projectiles) {
    const m = { x: p.p[0], y: p.p[1], z: p.p[2], yaw: Math.atan2(p.v[0], p.v[2]) };
    const face = key => Array.from({ length: 6 }, () => [key, 1, 1, 1, 1]);
    if (p.type === 'arrow' || p.type === 'explosive_arrow') {
      box(m, '', [0, 0], [0, 0, 0], [0.6, 0.6, 9], { faces: face('wood') });
      box(m, '', [0, 0], [0, -0.5, -3], [3, 1.5, 1], { faces: face('white') });
      if (p.type === 'explosive_arrow') box(m, '', [0, 0], [0, -0.8, 3], [2, 2, 3], { faces: face('explosive') });
    } else box(m, '', [0, 0], [0, 0, 0], [2.5, 2.5, 2.5], { faces: face('white') });
  }
  if (!vertices.length) return;
  gl.useProgram(progMob); gl.uniformMatrix4fv(progMob.u.uVP, false, matrix); gl.uniform3fv(progMob.u.uCam, eye);
  gl.uniform1f(progMob.u.uDay, light); gl.uniform3fv(progMob.u.uFog, fog); gl.uniform2f(progMob.u.uFogRange, near, far);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, mobTexture); gl.uniform1i(progMob.u.uTex, 0);
  gl.bindVertexArray(mobVAO); gl.bindBuffer(gl.ARRAY_BUFFER, mobVBO); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW); gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 7);
  gl.bindTexture(gl.TEXTURE_2D, atlasTex);
}

const progEntityFire = program(`
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUV;
uniform mat4 uVP; uniform vec3 uCam; out vec2 vUV; out float vDist;
void main(){vUV=aUV;vDist=length(aPos-uCam);gl_Position=uVP*vec4(aPos,1.0);}`, `
in vec2 vUV; in float vDist; uniform sampler2D uTex; uniform vec3 uFog; uniform vec2 uFogRange; out vec4 o;
void main(){vec4 c=texture(uTex,vUV);if(c.a<0.3)discard;o=vec4(mix(c.rgb,uFog,smoothstep(uFogRange.x,uFogRange.y,vDist)),c.a*0.9);}`,
['uVP', 'uCam', 'uTex', 'uFog', 'uFogRange']);
const entityFireVAO = gl.createVertexArray(), entityFireVBO = gl.createBuffer();
gl.bindVertexArray(entityFireVAO); gl.bindBuffer(gl.ARRAY_BUFFER, entityFireVBO);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12); gl.bindVertexArray(null);
function drawBurningMobs(matrix, eye, fog, near, far) {
  const vertices = [], cy = Math.cos(player.yaw), sy = Math.sin(player.yaw);
  for (const m of mobs) {
    if (!(m.burnTime > 0) || Math.hypot(m.x - eye[0], m.z - eye[2]) > far) continue;
    const d = MOB_TYPES[m.type], tile = T.FIRE + (Math.floor(gameTime * 8) + m.id) % 4;
    const width = d.width * 1.45, height = width * 1.35;
    for (let y = 0, layer = 0; y < d.height; y += height * 0.48, layer++) {
      const scale = 1 - y / d.height * 0.25;
      for (const side of [-1, 1]) for (const k of [0, 1, 2, 0, 2, 3]) {
        const u = CA[k], v = CB[k], x = (u - 0.5) * width * scale, z = side * d.width * 0.38;
        vertices.push(m.x + x * cy + z * sy, m.y + y + v * height, m.z - x * sy + z * cy,
          ((tile & 15) + 0.002 + (layer % 2 ? 1 - u : u) * 0.996) / 16,
          ((tile >> 4) + 0.002 + (1 - v) * 0.996) / 16);
      }
    }
  }
  if (!vertices.length) return;
  gl.useProgram(progEntityFire); gl.uniformMatrix4fv(progEntityFire.u.uVP, false, matrix); gl.uniform3fv(progEntityFire.u.uCam, eye);
  gl.uniform3fv(progEntityFire.u.uFog, fog); gl.uniform2f(progEntityFire.u.uFogRange, near, far); gl.uniform1i(progEntityFire.u.uTex, 0);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE); gl.depthMask(false);
  gl.bindVertexArray(entityFireVAO); gl.bindBuffer(gl.ARRAY_BUFFER, entityFireVBO);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW); gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 5);
  gl.depthMask(true); gl.enable(gl.CULL_FACE);
}
