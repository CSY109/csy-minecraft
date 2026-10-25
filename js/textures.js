'use strict';
// Embedded PNGs keep both file:// and the local server fully offline at runtime.
const textureImages = Object.create(null);
const BOW_PULL_TILES = [120, 121, 122];
const EXPLOSION_TILES = { fire: 126, smoke: 127 };
const texturesReady = Promise.all(Object.entries(CLASSIC_TEXTURES).map(([key, src]) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => { textureImages[key] = img; resolve(); };
  img.onerror = () => reject(new Error('无法加载贴图：' + key));
  img.src = src;
})));
function tintSprite(img, color) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 16;
  const c = cv.getContext('2d'); c.drawImage(img, 0, 0);
  c.globalCompositeOperation = 'multiply'; c.fillStyle = color; c.fillRect(0, 0, 16, 16);
  c.globalCompositeOperation = 'destination-in'; c.drawImage(img, 0, 0);
  c.globalCompositeOperation = 'source-over'; return cv;
}
function applyClassicAtlas() {
  const c = atlasCanvas.getContext('2d'); c.imageSmoothingEnabled = false;
  function tile(index, img) { const x = (index & 15) * 16, y = (index >> 4) * 16; c.clearRect(x, y, 16, 16); c.drawImage(img, 0, 0, 16, 16, x, y, 16, 16); }
  for (const [name, key] of Object.entries({ IRON_BLOCK: 'iron_block', GOLD_BLOCK: 'gold_block', DIAMOND_BLOCK: 'diamond_block',
    GOLD: 'gold_ore', DIAMOND: 'diamond_ore', WOOL: 'wool_colored_white', MOSS: 'cobblestone_mossy', CLAY: 'clay', OBSIDIAN: 'obsidian',
    PUMPKIN: 'pumpkin_face_off', PUMPKIN_TOP: 'pumpkin_top', PUMPKIN_SIDE: 'pumpkin_side',
    WORKBENCH: 'crafting_table_top', WORKBENCH_SIDE: 'crafting_table_side', WORKBENCH_FRONT: 'crafting_table_front' })) tile(T[name], textureImages['block_' + key]);
  for (const [name, key] of Object.entries({ NETHERRACK: 'netherrack', SOUL_SAND: 'soul_sand', NETHER_BRICK: 'nether_brick', GLOWSTONE: 'glowstone', QUARTZ: 'quartz_ore', MAGMA: 'magma', LAVA: 'lava_still', PORTAL: 'portal' })) tile(T[name], textureImages['block_' + key]);
  const names = { STICK: 'stick', COAL: 'coal', INGOT: 'iron_ingot', GOLD: 'gold_ingot', DIAMOND: 'diamond',
    MEAT: 'porkchop_raw', COOKED: 'porkchop_cooked', APPLE: 'apple', STRING: 'string', ARROW: 'arrow', BOW: 'bow_standby',
    FLINT: 'flint', FLINT_STEEL: 'flint_and_steel', BUCKET: 'bucket_empty', WATER_BUCKET: 'bucket_water', LAVA_BUCKET: 'bucket_lava', GUNPOWDER: 'gunpowder' };
  for (const mat of ['WOOD', 'STONE', 'IRON', 'DIAMOND']) for (const tool of ['PICK', 'AXE', 'SHOVEL', 'SWORD']) names[mat + '_' + tool] = mat.toLowerCase() + '_' + (tool === 'PICK' ? 'pickaxe' : tool.toLowerCase());
  for (const [key, name] of Object.entries(names)) tile(TOP[I[key]], textureImages[name]);
  BOW_PULL_TILES.forEach((index, stage) => tile(index, textureImages['bow_pulling_' + stage]));
  tile(T.TORCH, textureImages.block_torch_on);
  const bed = textureImages.entity_bed_red;
  function bedTile(index, sx, sy, width, height, turn = false) {
    const x = (index & 15) * 16, y = (index >> 4) * 16;
    c.clearRect(x, y, 16, 16); c.save();
    if (turn) { c.translate(x, y + width); c.rotate(-Math.PI / 2); }
    else c.translate(x, y);
    c.drawImage(bed, sx, sy, width, height, 0, 0, width, height); c.restore();
  }
  bedTile(T.BED_HEAD, 6, 6, 16, 16); bedTile(T.BED_FOOT, 6, 28, 16, 16);
  bedTile(T.BED_HEAD_SIDE, 0, 6, 6, 16, true); bedTile(T.BED_FOOT_SIDE, 0, 28, 6, 16, true);
  bedTile(T.BED_HEAD_END, 6, 0, 16, 6); bedTile(T.BED_FOOT_END, 6, 22, 16, 6);
  bedTile(T.BED_LEG, 53, 3, 3, 3); bedTile(T.BED_BOTTOM, 28, 6, 16, 16);
  tile(TOP[I.BED], bedItemSprite());
  for (let frame = 0; frame < 4; frame++) {
    const index = T.FIRE + frame, img = textureImages.block_fire_layer_0;
    c.clearRect((index & 15) * 16, (index >> 4) * 16, 16, 16);
    c.drawImage(img, 0, frame * 16 * Math.max(1, Math.floor(img.height / 64)), 16, 16, (index & 15) * 16, (index >> 4) * 16, 16, 16);
  }
  tile(TOP[I.RAW_IRON], tintSprite(textureImages.iron_ingot, '#c48d71'));
  // Keep the classic arrow's pixels and outline, with a red explosive tip.
  const arrow = document.createElement('canvas'); arrow.width = arrow.height = 16;
  const ac = arrow.getContext('2d'); ac.drawImage(textureImages.arrow, 0, 0);
  const pixels = ac.getImageData(0, 0, 16, 16);
  for (let y = 0; y < 6; y++) for (let x = 9; x < 16; x++) {
    const n = (x + y * 16) * 4;
    if (pixels.data[n + 3]) {
      const bright = pixels.data[n] / 255;
      pixels.data[n] = 110 + bright * 130; pixels.data[n + 1] = 28 + bright * 35; pixels.data[n + 2] = 24 + bright * 24;
    }
  }
  ac.putImageData(pixels, 0, 0); tile(TOP[I.EXPLOSIVE_ARROW], arrow);
  for (const [key, color] of Object.entries({ fire: '#ffba50', smoke: '#ddd9d2' })) {
    c.fillStyle = color; const t = EXPLOSION_TILES[key]; c.fillRect((t & 15) * 16, (t >> 4) * 16, 16, 16);
  }
  const eggColors = { pig: ['#f0a5a2', '#db867e'], cow: ['#45372a', '#a69d85'], sheep: ['#e7e7df', '#a09585'], zombie: ['#338060', '#6c9940'], spider: ['#342c28', '#a41917'], creeper: ['#5da83a', '#26301a'] };
  for (const [id, item] of Object.entries(ITEMS)) if (item.mob) {
    const [base, spots] = eggColors[item.mob], cv = tintSprite(textureImages.spawn_egg, base);
    cv.getContext('2d').drawImage(tintSprite(textureImages.spawn_egg_overlay, spots), 0, 0); tile(TOP[id], cv);
  }
  gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas); gl.generateMipmap(gl.TEXTURE_2D);
  for (const id of Object.keys(iconCache)) delete iconCache[id];
}

function bedItemSprite() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 16;
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const faces = [...bedGeometry(B.BED), ...bedGeometry(B.BED + 4).map(quad => quad.map(q => [q[0], q[1], q[2] - 1, ...q.slice(3)]))];
  const project = p => [8 + (p[0] - .5 - p[2]) * 4.5, 10 + (p[0] - .5 + p[2]) * 2.25 - p[1] * 7];
  faces.sort((a, b) => a.reduce((s, p) => s + p[0] + p[2] + p[1] * .7, 0) - b.reduce((s, p) => s + p[0] + p[2] + p[1] * .7, 0));
  for (const quad of faces) {
    const p = quad.map(project), ex = p[1][0] - p[0][0], ey = p[1][1] - p[0][1], fx = p[3][0] - p[0][0], fy = p[3][1] - p[0][1];
    if (ex * fy - ey * fx >= 0) continue;
    const uv = quad.map(q => [q[3] * 256, q[4] * 256]);
    const u = uv[1][0] - uv[0][0], v = uv[3][1] - uv[0][1];
    const a = ex / u, b = ey / u, cc = fx / v, d = fy / v;
    ctx.save(); ctx.beginPath(); p.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.clip();
    ctx.setTransform(a, b, cc, d, p[0][0] - a * uv[0][0] - cc * uv[0][1], p[0][1] - b * uv[0][0] - d * uv[0][1]);
    ctx.drawImage(atlasCanvas, 0, 0); ctx.restore();
  }
  return cv;
}
