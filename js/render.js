'use strict';
// ============================================================
//  WebGL2 renderer: shaders, sky, clouds, chunk meshes, particles
// ============================================================

const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
if (!gl) { alert('需要支持 WebGL2 的浏览器'); }

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
  return s;
}
function program(vs, fs, names) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, '#version 300 es\nprecision highp float;\n' + vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;\n' + fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  p.u = {};
  for (const n of names) p.u[n] = gl.getUniformLocation(p, n);
  return p;
}

const WORLD_VS = `
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUV; layout(location=2) in float aLight; layout(location=3) in float aSky;
layout(location=4) in float aBlock;
uniform mat4 uVP; uniform vec3 uOff; uniform vec3 uCam;
out vec2 vUV; out float vLight; out float vSky; out float vBlock; out float vDist; out vec3 vWorld;
void main(){ vec3 p=aPos+uOff; vUV=aUV; vLight=aLight; vSky=aSky; vBlock=aBlock/15.0; vDist=length(p-uCam); vWorld=p; gl_Position=uVP*vec4(p,1.0); }`;
const WORLD_FS = `
in vec2 vUV; in float vLight; in float vSky; in float vBlock; in float vDist; in vec3 vWorld; out vec4 o;
uniform sampler2D uTex; uniform float uDay; uniform float uAmbient; uniform vec3 uTint; uniform vec3 uFog; uniform vec2 uFogRange; uniform float uTime;
void main(){
  vec2 uv=vUV;
  float baseTile=floor(vUV.x*16.0)+floor(vUV.y*16.0)*16.0;
  if(baseTile==${T.FIRE}.0) uv.x+=mod(floor(uTime*8.0),4.0)/16.0;
  vec4 c=texture(uTex,uv); if(c.a<0.5) discard;
  float amb=mix(uAmbient,uDay,vSky);
  float tile=floor(vUV.x*16.0)+floor(vUV.y*16.0)*16.0;
  vec3 illumination=max(vec3(amb)*uTint,vec3(1.0,0.82,0.62)*vBlock);
  vec3 col=c.rgb*vLight*illumination;
  float f=smoothstep(uFogRange.x,uFogRange.y,vDist);
  o=vec4(mix(col,uFog,f),1.0);
}`;
const WATER_FS = `
in vec2 vUV; in float vLight; in float vSky; in float vBlock; in float vDist; in vec3 vWorld; out vec4 o;
uniform sampler2D uTex; uniform float uDay; uniform float uAmbient; uniform vec3 uTint; uniform vec3 uFog; uniform vec2 uFogRange; uniform float uTime;
void main(){
  float tile=floor(vUV.x*16.0)+floor(vUV.y*16.0)*16.0;
  vec2 localUV=fract(vUV*16.0);
  vec2 tileBase=floor(vUV*16.0)/16.0;
  float speed=tile==${T.LAVA}.0?0.07:0.16;
  vec2 sampleUV=tileBase+(vec2(0.005)+fract(localUV+vec2(sin(uTime*0.7)*0.06,uTime*speed))*0.99)/16.0;
  vec4 c=texture(uTex,sampleUV);
  float w=0.93+0.07*sin(vWorld.x*2.5+uTime*1.6)*sin(vWorld.z*2.5+uTime*1.3);
  float amb=mix(uAmbient,uDay,vSky);
  vec3 col=c.rgb*vLight*max(vec3(amb)*uTint,vec3(1.0,0.82,0.62)*vBlock)*w;
  float alpha=0.72;
  if(tile==${T.LAVA}.0){col=c.rgb*(0.9+0.1*sin(uTime+vWorld.y));alpha=0.98;}
  if(tile==${T.PORTAL}.0){col=c.rgb*(0.8+0.2*sin(uTime*2.0+vWorld.y*3.0));alpha=0.78;}
  float f=smoothstep(uFogRange.x,uFogRange.y,vDist);
  o=vec4(mix(col,uFog,f),alpha);
}`;
const progWorld = program(WORLD_VS, WORLD_FS, ['uVP', 'uOff', 'uCam', 'uTex', 'uDay', 'uAmbient', 'uTint', 'uFog', 'uFogRange', 'uTime']);
const progWater = program(WORLD_VS, WATER_FS, ['uVP', 'uOff', 'uCam', 'uTex', 'uDay', 'uAmbient', 'uTint', 'uFog', 'uFogRange', 'uTime']);

const progSky = program(`
out vec2 vN;
void main(){ vec2 p=vec2((gl_VertexID<<1)&2, gl_VertexID&2); vN=p*2.0-1.0; gl_Position=vec4(vN,0.9999,1.0); }`, `
in vec2 vN; out vec4 o;
uniform vec3 uR,uU,uF; uniform vec2 uTan; uniform vec3 uZen,uHor,uSun; uniform float uNight,uGlow;
float h3(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
void main(){
  vec3 d=normalize(uF+uR*vN.x*uTan.x+uU*vN.y*uTan.y);
  float t=clamp(d.y,0.0,1.0);
  vec3 col=mix(uHor,uZen,pow(t,0.55));
  if(d.y<0.0) col=uHor;
  float sd=dot(d,uSun);
  col+=vec3(1.0,0.6,0.3)*pow(max(sd,0.0),6.0)*uGlow*0.8;
  vec3 t1=normalize(cross(uSun,vec3(0.0,0.0,1.0))); vec3 t2=cross(uSun,t1);
  if(sd>0.0){ vec2 q=vec2(dot(d,t1),dot(d,t2))/sd; if(max(abs(q.x),abs(q.y))<0.065) col=vec3(1.0,0.97,0.78); }
  else { float md=-sd; vec2 q=vec2(dot(d,t1),dot(d,t2))/md; if(max(abs(q.x),abs(q.y))<0.045) col=mix(col,vec3(0.86,0.9,0.98),0.95); }
  if(uNight>0.0 && d.y>0.0){ float s=h3(floor(d*170.0)); if(s>0.9965) col+=vec3(uNight*(s-0.9965)*280.0); }
  o=vec4(col,1.0);
}`, ['uR', 'uU', 'uF', 'uTan', 'uZen', 'uHor', 'uSun', 'uNight', 'uGlow']);

const progCloud = program(`
uniform mat4 uVP; uniform vec2 uCenter; uniform float uY; uniform vec2 uScroll;
out vec2 vUV; out float vD;
void main(){
  vec2 c=vec2(float(gl_VertexID&1)*2.0-1.0, float((gl_VertexID>>1)&1)*2.0-1.0);
  vec2 p=uCenter+c*3000.0; vUV=p/(12.0*128.0)+uScroll; vD=length(c*3000.0);
  gl_Position=uVP*vec4(p.x,uY,p.y,1.0); }`, `
in vec2 vUV; in float vD; out vec4 o; uniform sampler2D uTex; uniform float uDayF;
void main(){ float a=texture(uTex,vUV).a; if(a<0.5) discard;
  vec3 col=mix(vec3(0.14,0.16,0.26),vec3(1.0),uDayF);
  o=vec4(col,0.82*(1.0-smoothstep(500.0,2800.0,vD))); }`, ['uVP', 'uCenter', 'uY', 'uScroll', 'uTex', 'uDayF']);

const progLine = program(`
layout(location=0) in vec3 aPos; uniform mat4 uVP; uniform vec3 uOff;
void main(){ gl_Position=uVP*vec4(aPos+uOff,1.0); gl_Position.z-=0.0004; }`, `
out vec4 o; void main(){ o=vec4(0.0,0.0,0.0,0.7); }`, ['uVP', 'uOff']);

const progPart = program(`
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUV; layout(location=2) in float aSize;
uniform mat4 uVP; uniform float uPx; out vec2 vUV;
void main(){ gl_Position=uVP*vec4(aPos,1.0); gl_PointSize=aSize*uPx/max(gl_Position.w,0.01); vUV=aUV; }`, `
in vec2 vUV; out vec4 o; uniform sampler2D uTex; uniform float uLight;
void main(){ vec4 c=texture(uTex,vUV+gl_PointCoord*(0.25/16.0)); if(c.a<0.5) discard; o=vec4(c.rgb*uLight,1.0); }`, ['uVP', 'uPx', 'uTex', 'uLight']);

// ---------------- resources ----------------
const atlasCanvas = makeAtlas();
const atlasTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, atlasTex);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 3);
gl.generateMipmap(gl.TEXTURE_2D);

const cloudTex = (function () {
  const N = 128, data = new Uint8Array(N * N * 4);
  const vn = (x, y, P, s) => {
    const fx = x / N * P, fy = y / N * P, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const h = (a, b) => hash2(((a % P) + P) % P, ((b % P) + P) % P, s);
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return lerp(lerp(h(ix, iy), h(ix + 1, iy), sx), lerp(h(ix, iy + 1), h(ix + 1, iy + 1), sx), sy);
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = vn(x, y, 4, 1) * 0.5 + vn(x, y, 8, 2) * 0.3 + vn(x, y, 16, 3) * 0.2;
    const i = (y * N + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = v > 0.57 ? 255 : 0;
  }
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return t;
})();

// shared quad index buffer
const MAXQ = 100000;
const quadIBO = (function () {
  const idx = new Uint32Array(MAXQ * 6);
  for (let q = 0; q < MAXQ; q++) {
    const b = q * 4, i = q * 6;
    idx[i] = b; idx[i + 1] = b + 1; idx[i + 2] = b + 2; idx[i + 3] = b; idx[i + 4] = b + 2; idx[i + 5] = b + 3;
  }
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  return b;
})();

function makeMeshBuf(data) {
  if (!data.length) return null;
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 32, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 20);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 32, 24);
  gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 32, 28);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIBO);
  gl.bindVertexArray(null);
  return { vao, vbo, n: Math.min(MAXQ, (data.length / 32) | 0) * 6 };
}
function freeMeshBuf(m) { if (m) { gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.vbo); } }
function freeChunkMesh(c) {
  if (!c.mesh) return;
  freeMeshBuf(c.mesh.o); freeMeshBuf(c.mesh.w);
  c.mesh = null;
}
function uploadChunk(c, data) {
  freeChunkMesh(c);
  c.mesh = { o: makeMeshBuf(data.opaque), w: makeMeshBuf(data.water) };
}

// held-item / generic block mesh
function buildBlockMesh(id, itemTile = TOP[id]) {
  const buf = new FloatBuf(512);
  if (!id) return null;
  if (ITEMS[id]) {
    const tile = itemTile, tu = (tile & 15) / 16, tv = (tile >> 4) / 16;
    for (const [indices, z] of [[[0, 1, 2, 3], 0.53125], [[3, 2, 1, 0], 0.46875]]) {
      const points = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (const k of indices) { const [x, y] = points[k]; buf.v(x, y, z, tu + (0.002 + x * 0.996) / 16, tv + (0.998 - y * 0.996) / 16, 1, 1); }
    }
    // Extrude exposed pixel edges, like Minecraft's generated item models.
    const pixels = atlasCanvas.getContext('2d').getImageData((tile & 15) * 16, (tile >> 4) * 16, 16, 16).data;
    const opaque = (x, y) => x >= 0 && x < 16 && y >= 0 && y < 16 && pixels[(y * 16 + x) * 4 + 3] > 127;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (opaque(x, y)) {
      const x0 = x / 16, x1 = (x + 1) / 16, y0 = (15 - y) / 16, y1 = (16 - y) / 16;
      const faces = [
        [1, 0, [[x1, y0, 0.53125], [x1, y0, 0.46875], [x1, y1, 0.46875], [x1, y1, 0.53125]], 0.75],
        [-1, 0, [[x0, y0, 0.46875], [x0, y0, 0.53125], [x0, y1, 0.53125], [x0, y1, 0.46875]], 0.75],
        [0, -1, [[x0, y1, 0.53125], [x1, y1, 0.53125], [x1, y1, 0.46875], [x0, y1, 0.46875]], 1],
        [0, 1, [[x0, y0, 0.46875], [x1, y0, 0.46875], [x1, y0, 0.53125], [x0, y0, 0.53125]], 0.6],
      ];
      for (const [dx, dy, points, shade] of faces) if (!opaque(x + dx, y + dy)) for (const p of points) buf.v(...p, tu + (x + 0.5) / 256, tv + (y + 0.5) / 256, shade, 1);
    }
  } else if (CROSS[id]) {
    const tile = TOP[id], tu = (tile & 15) / 16, tv = (tile >> 4) / 16, e = 1 / 16;
    const q = (ax, az, bx, bz, rev) => {
      const P = [[ax, 0, az, 0, 1], [bx, 0, bz, 1, 1], [bx, 1, bz, 1, 0], [ax, 1, az, 0, 0]];
      if (rev) P.reverse();
      for (const p of P) buf.v(p[0], p[1], p[2], tu + p[3] * e, tv + p[4] * e, 1, 1);
    };
    q(0, 0, 1, 1, false); q(0, 0, 1, 1, true); q(1, 0, 0, 1, false); q(1, 0, 0, 1, true);
  } else {
    for (let d = 0; d < 6; d++) {
      const D = DIRS[d];
      const tile = classicBlockTile(id, d);
      const tu = (tile & 15) / 16, tv = (tile >> 4) / 16;
      for (let k = 0; k < 4; k++) {
        const a = CA[k], b = CB[k];
        buf.v(D.o[0] + D.u[0] * a + D.v[0] * b, D.o[1] + D.u[1] * a + D.v[1] * b, D.o[2] + D.u[2] * a + D.v[2] * b,
          tu + (a ? 0.998 : 0.002) / 16, tv + (b ? 0.002 : 0.998) / 16, D.shade, 1);
      }
    }
  }
  const m = makeMeshBuf(buf.take());
  return m;
}

// selection outline
const lineVAO = (function () {
  const e = -0.003, f = 1.003, v = [];
  const c = [[e, e, e], [f, e, e], [f, e, f], [e, e, f], [e, f, e], [f, f, e], [f, f, f], [e, f, f]];
  const ed = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (const [a, b] of ed) v.push(...c[a], ...c[b]);
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
  gl.bindVertexArray(null);
  return vao;
})();

// particles
const partVAO = gl.createVertexArray();
const partVBO = gl.createBuffer();
gl.bindVertexArray(partVAO);
gl.bindBuffer(gl.ARRAY_BUFFER, partVBO);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 12);
gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 24, 20);
gl.bindVertexArray(null);
const emptyVAO = gl.createVertexArray();

// ---------------- icons for UI ----------------
function makeIcon(id) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 32;
  const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
  const src = (tile) => [(tile & 15) * 16, (tile >> 4) * 16];
  if (!id) return cv;
  if (CROSS[id] || ITEMS[id]) {
    const [sx, sy] = src(TOP[id]);
    c.drawImage(atlasCanvas, sx, sy, 16, 16, 2, 2, 28, 28);
    return cv;
  }
  const face = (tile, m, shade) => {
    const [sx, sy] = src(tile);
    c.save(); c.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    c.drawImage(atlasCanvas, sx, sy, 16, 16, 0, 0, 16, 16);
    c.fillStyle = 'rgba(0,0,0,' + shade + ')'; c.fillRect(0, 0, 16, 16);
    c.restore();
  };
  face(classicBlockTile(id, 4), [14 / 16, 7.5 / 16, -14 / 16, 7.5 / 16, 16, 1], 0);
  face(classicBlockTile(id, 2), [14 / 16, 7.5 / 16, 0, 14 / 16, 2, 8.5], 0.22);
  face(classicBlockTile(id, 0), [14 / 16, -7.5 / 16, 0, 14 / 16, 16, 16], 0.42);
  return cv;
}
