'use strict';
// ============================================================
//  Block registry + procedural 16x16 texture atlas
// ============================================================

const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, SAND: 5, LOG: 6, LEAVES: 7, PLANKS: 8, WATER: 9,
  BEDROCK: 10, GLASS: 11, BRICK: 12, COAL: 13, IRON: 14, GRAVEL: 15, SNOW: 16, SANDSTONE: 17,
  TALLGRASS: 18, ROSE: 19, DANDELION: 20, CACTUS: 21, SNOWGRASS: 22,
  IRON_BLOCK: 23, PUMPKIN: 24, GOLD: 25, DIAMOND: 26, GOLD_BLOCK: 27,
  DIAMOND_BLOCK: 28, WOOL: 29, MOSS: 30, CLAY: 31, OBSIDIAN: 32, WORKBENCH: 33,
  NETHERRACK: 34, SOUL_SAND: 35, NETHER_BRICK: 36, GLOWSTONE: 37, QUARTZ: 38, MAGMA: 39, LAVA: 40, PORTAL: 41,
  TORCH: 42, FIRE: 43,
};

// atlas tile indices
const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, COBBLE: 4, SAND: 5, LOG_SIDE: 6, LOG_TOP: 7, LEAVES: 8,
  PLANKS: 9, WATER: 10, BEDROCK: 11, GLASS: 12, BRICK: 13, COAL: 14, IRON: 15, GRAVEL: 16, SNOW: 17,
  SNOW_SIDE: 18, SANDSTONE_SIDE: 19, SANDSTONE_TOP: 20, TALLGRASS: 21, ROSE: 22, DANDELION: 23,
  CACTUS_SIDE: 24, CACTUS_TOP: 25,
  IRON_BLOCK: 26, PUMPKIN: 27, PUMPKIN_TOP: 28, GOLD: 29, DIAMOND: 30,
  GOLD_BLOCK: 31, DIAMOND_BLOCK: 32, WOOL: 33, MOSS: 34, CLAY: 35, OBSIDIAN: 36, WORKBENCH: 37,
  PUMPKIN_SIDE: 38, WORKBENCH_SIDE: 39, WORKBENCH_FRONT: 40,
  NETHERRACK: 112, SOUL_SAND: 113, NETHER_BRICK: 114, GLOWSTONE: 115, QUARTZ: 116, MAGMA: 117, LAVA: 118, PORTAL: 119,
  TORCH: 128, FIRE: 129,
};

const NAMES = [];
const OCCL = new Uint8Array(256);   // fully opaque cube (occludes neighbours)
const SOLID = new Uint8Array(256);  // collides with the player
const CROSS = new Uint8Array(256);  // x-shaped plant
const LIQ = new Uint8Array(256);    // liquid
const LBLOCK = new Uint8Array(256); // blocks skylight
const TOP = new Uint8Array(256), BOT = new Uint8Array(256), SIDE = new Uint8Array(256);

function classicBlockTile(id, face) {
  if (id === B.PUMPKIN) return face >= 4 ? T.PUMPKIN_TOP : face === 2 ? T.PUMPKIN : T.PUMPKIN_SIDE;
  if (id === B.WORKBENCH) return face === 4 ? T.WORKBENCH : face === 5 ? T.PLANKS : face === 2 || face === 3 ? T.WORKBENCH_FRONT : T.WORKBENCH_SIDE;
  return face === 4 ? TOP[id] : face === 5 ? BOT[id] : SIDE[id];
}

function defBlock(id, name, top, bot, side, o) {
  o = o || {};
  NAMES[id] = name;
  TOP[id] = top; BOT[id] = bot; SIDE[id] = side;
  const cube = !o.cross && !o.liquid && !o.cutout;
  OCCL[id] = cube ? 1 : 0;
  SOLID[id] = (o.cross || o.liquid || o.nonSolid) ? 0 : 1;
  CROSS[id] = o.cross ? 1 : 0;
  LIQ[id] = o.liquid ? 1 : 0;
  LBLOCK[id] = (cube || id === B.LEAVES) ? 1 : 0;
}
defBlock(B.GRASS, '草方块', T.GRASS_TOP, T.DIRT, T.GRASS_SIDE);
defBlock(B.DIRT, '泥土', T.DIRT, T.DIRT, T.DIRT);
defBlock(B.STONE, '石头', T.STONE, T.STONE, T.STONE);
defBlock(B.COBBLE, '圆石', T.COBBLE, T.COBBLE, T.COBBLE);
defBlock(B.SAND, '沙子', T.SAND, T.SAND, T.SAND);
defBlock(B.LOG, '橡木原木', T.LOG_TOP, T.LOG_TOP, T.LOG_SIDE);
defBlock(B.LEAVES, '橡树树叶', T.LEAVES, T.LEAVES, T.LEAVES, { cutout: true });
defBlock(B.PLANKS, '橡木木板', T.PLANKS, T.PLANKS, T.PLANKS);
defBlock(B.WATER, '水', T.WATER, T.WATER, T.WATER, { liquid: true });
defBlock(B.BEDROCK, '基岩', T.BEDROCK, T.BEDROCK, T.BEDROCK);
defBlock(B.GLASS, '玻璃', T.GLASS, T.GLASS, T.GLASS, { cutout: true });
defBlock(B.BRICK, '砖块', T.BRICK, T.BRICK, T.BRICK);
defBlock(B.COAL, '煤矿石', T.COAL, T.COAL, T.COAL);
defBlock(B.IRON, '铁矿石', T.IRON, T.IRON, T.IRON);
defBlock(B.GRAVEL, '沙砾', T.GRAVEL, T.GRAVEL, T.GRAVEL);
defBlock(B.SNOW, '雪块', T.SNOW, T.SNOW, T.SNOW);
defBlock(B.SANDSTONE, '砂岩', T.SANDSTONE_TOP, T.SANDSTONE_TOP, T.SANDSTONE_SIDE);
defBlock(B.TALLGRASS, '草', T.TALLGRASS, T.TALLGRASS, T.TALLGRASS, { cross: true });
defBlock(B.ROSE, '玫瑰', T.ROSE, T.ROSE, T.ROSE, { cross: true });
defBlock(B.DANDELION, '蒲公英', T.DANDELION, T.DANDELION, T.DANDELION, { cross: true });
defBlock(B.CACTUS, '仙人掌', T.CACTUS_TOP, T.CACTUS_TOP, T.CACTUS_SIDE, { cutout: true });
defBlock(B.SNOWGRASS, '积雪草方块', T.SNOW, T.DIRT, T.SNOW_SIDE);
// cactus is solid but not a full occluding cube (we draw it as a plain cube with cutout rules)
LBLOCK[B.CACTUS] = 0;
for (const [key, name] of [['IRON_BLOCK', '铁块'], ['PUMPKIN', '雕刻南瓜'], ['GOLD', '金矿石'],
  ['DIAMOND', '钻石矿石'], ['GOLD_BLOCK', '金块'], ['DIAMOND_BLOCK', '钻石块'], ['WOOL', '羊毛'],
  ['MOSS', '苔石'], ['CLAY', '黏土'], ['OBSIDIAN', '黑曜石'], ['WORKBENCH', '工作台']]) {
  defBlock(B[key], name, key === 'PUMPKIN' ? T.PUMPKIN_TOP : T[key], key === 'PUMPKIN' ? T.PUMPKIN_TOP : T[key], T[key]);
}

for (const [key, name] of [['NETHERRACK', '地狱岩'], ['SOUL_SAND', '灵魂沙'], ['NETHER_BRICK', '地狱砖'], ['GLOWSTONE', '荧石'], ['QUARTZ', '下界石英矿石'], ['MAGMA', '岩浆块']]) defBlock(B[key], name, T[key], T[key], T[key]);
defBlock(B.LAVA, '熔岩', T.LAVA, T.LAVA, T.LAVA, { liquid: true });
defBlock(B.PORTAL, '下界传送门', T.PORTAL, T.PORTAL, T.PORTAL, { cutout: true, nonSolid: true });
defBlock(B.TORCH, '火把', T.TORCH, T.TORCH, T.TORCH, { cross: true });
defBlock(B.FIRE, '火', T.FIRE, T.FIRE, T.FIRE, { cross: true });
const INVENTORY_BLOCKS = [];
for (let i = 1; i < NAMES.length; i++) if (i !== B.PORTAL && i !== B.FIRE) INVENTORY_BLOCKS.push(i);

// ---------------- texture painting ----------------
function makeAtlas() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const ctx = cv.getContext('2d');

  function paint(tile, seed, fn) {
    const img = ctx.createImageData(16, 16);
    const rnd = mulberry32(seed * 7919 + 13);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const c = fn(x, y, rnd) || [255, 0, 255, 255];
      const i = (y * 16 + x) * 4;
      img.data[i] = clamp(c[0], 0, 255); img.data[i + 1] = clamp(c[1], 0, 255);
      img.data[i + 2] = clamp(c[2], 0, 255); img.data[i + 3] = c[3] === undefined ? 255 : c[3];
    }
    ctx.putImageData(img, (tile & 15) * 16, (tile >> 4) * 16);
  }
  const var_ = (c, v, r) => { const d = (r() - 0.5) * 2 * v; return [c[0] + d, c[1] + d, c[2] + d, 255]; };
  const mul = (c, f) => [c[0] * f, c[1] * f, c[2] * f, c[3] === undefined ? 255 : c[3]];
  const H = (x, y, s) => hash2(x, y, s);
  const STONE_C = [125, 125, 125];
  const DIRT_C = [134, 96, 67];

  const stoneFn = (seed) => (x, y, r) => {
    const n = H(x >> 1, y >> 1, seed) * 0.5 + r() * 0.5;
    return var_(STONE_C, 0, r).map((v, i) => i < 3 ? v + (n - 0.5) * 36 : v);
  };
  const dirtFn = (x, y, r) => {
    let f = 1 + (r() - 0.5) * 0.25;
    if (H(x, y, 3) < 0.14) f *= 0.82; else if (H(x, y, 4) < 0.1) f *= 1.15;
    return mul(DIRT_C, f);
  };
  const grassGreen = (r) => var_([96, 160, 54], 16, r);

  paint(T.GRASS_TOP, 1, (x, y, r) => {
    const c = grassGreen(r);
    if (H(x, y, 9) < 0.12) return mul(c, 0.85);
    return c;
  });
  paint(T.DIRT, 2, dirtFn);
  paint(T.GRASS_SIDE, 3, (x, y, r) => {
    const depth = 2 + (H(x, 0, 21) < 0.5 ? 1 : 0) + (H(x, 0, 22) < 0.25 ? 1 : 0);
    if (y < depth) return grassGreen(r);
    return dirtFn(x, y, r);
  });
  paint(T.STONE, 4, stoneFn(5));
  paint(T.COBBLE, 5, (x, y, r) => {
    // irregular rounded stones
    const row = Math.floor(y / 4), off = (row % 2) * 3;
    const cx = Math.floor((x + off) / 6);
    const lx = (x + off) % 6, ly = y % 4;
    if (lx === 0 || ly === 0) return mul([70, 70, 70], 1 + (r() - 0.5) * 0.2);
    const base = 100 + H(cx, row, 17) * 70;
    const edge = (lx === 1 || ly === 1) ? 1.12 : (lx === 5 || ly === 3) ? 0.86 : 1;
    const v = (base + (r() - 0.5) * 16) * edge;
    return [v, v, v, 255];
  });
  paint(T.SAND, 6, (x, y, r) => {
    const c = var_([219, 207, 152], 7, r);
    if (H(x, y, 7) < 0.1) return mul(c, 0.93);
    return c;
  });
  paint(T.LOG_SIDE, 7, (x, y, r) => {
    const streak = H(x, 0, 31) * 0.5 + H(x >> 1, 0, 32) * 0.5;
    let f = 0.72 + streak * 0.55 + (r() - 0.5) * 0.12;
    if (H(x, y >> 1, 33) < 0.1) f *= 0.82;
    return mul([104, 82, 50], f * 1.25);
  });
  paint(T.LOG_TOP, 8, (x, y, r) => {
    const dx = x - 7.5, dy = y - 7.5, d = Math.sqrt(dx * dx + dy * dy);
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 6.9) return mul([104, 82, 50], 1.1 + (r() - 0.5) * 0.15);
    const ring = Math.floor(d * 0.95) % 2;
    const c = ring ? [155, 122, 72] : [182, 148, 92];
    return var_(c, 8, r);
  });
  paint(T.LEAVES, 9, (x, y, r) => {
    if (r() < 0.16) return [0, 0, 0, 0];
    const c = var_([52, 122, 38], 22, r);
    if (H(x, y, 41) < 0.2) return mul(c, 0.72);
    return c;
  });
  paint(T.PLANKS, 10, (x, y, r) => {
    let f = 1 + (r() - 0.5) * 0.1;
    const board = y >> 2;
    f *= 0.94 + H(board, 0, 51) * 0.12;
    if (y % 4 === 3) f *= 0.78;
    const seam = (board % 2) ? 3 : 11;
    if (x === seam && (y % 4) !== 3) f *= 0.8;
    if (H(x >> 1, y, 52) < 0.06) f *= 0.9;
    return mul([160, 130, 78], f);
  });
  paint(T.WATER, 11, (x, y, r) => {
    const f = 1 + (H(x >> 1, y >> 1, 61) - 0.5) * 0.22 + (r() - 0.5) * 0.05;
    return mul([46, 92, 205], f);
  });
  paint(T.BEDROCK, 12, (x, y, r) => {
    const n = H(x >> 1, y >> 1, 71);
    const v = 40 + n * 55 + r() * 18;
    return [v, v, v, 255];
  });
  paint(T.GLASS, 13, (x, y, r) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return [205, 232, 240, 255];
    if ((x === y && x > 2 && x < 7) || (x === y + 1 && x > 2 && x < 6)) return [255, 255, 255, 190];
    if ((x + y === 13 && x > 8 && x < 13)) return [255, 255, 255, 140];
    return [200, 230, 245, 0];
  });
  paint(T.BRICK, 14, (x, y, r) => {
    const row = y >> 2, ly = y & 3;
    const off = (row % 2) * 4;
    const lx = (x + off) % 8;
    if (ly === 3 || lx === 7) return var_([185, 180, 170], 8, r);
    const b = H((x + off) >> 3, row, 81);
    return var_([150 + b * 20, 72 + b * 10, 58 + b * 8], 9, r);
  });
  const ore = (seed, col) => (x, y, r) => {
    const base = stoneFn(5)(x, y, r);
    const rr = mulberry32(seed);
    for (let i = 0; i < 6; i++) {
      const ox = (rr() * 13 | 0) + 1, oy = (rr() * 13 | 0) + 1;
      if (x >= ox && x < ox + 3 && y >= oy && y < oy + 2 && (x + y + i) % 5 !== 0) return var_(col, 14, r);
    }
    return base;
  };
  paint(T.COAL, 15, ore(101, [38, 38, 38]));
  paint(T.IRON, 16, ore(202, [216, 175, 147]));
  paint(T.GRAVEL, 17, (x, y, r) => {
    const n = H(x >> 1, y >> 1, 91);
    const v = 105 + n * 75 + (r() - 0.5) * 20;
    return [v, v * 0.98, v * 0.97, 255];
  });
  paint(T.SNOW, 18, (x, y, r) => var_([246, 249, 251], 5, r));
  paint(T.SNOW_SIDE, 19, (x, y, r) => {
    const depth = 3 + (H(x, 0, 23) < 0.5 ? 1 : 0);
    if (y < depth) return var_([246, 249, 251], 5, r);
    return dirtFn(x, y, r);
  });
  paint(T.SANDSTONE_SIDE, 20, (x, y, r) => {
    let f = 1 + (r() - 0.5) * 0.06;
    if (y === 3 || y === 12) f *= 0.9;
    if (y === 0 || y === 15) f *= 1.04;
    return mul([218, 205, 150], f);
  });
  paint(T.SANDSTONE_TOP, 21, (x, y, r) => mul([222, 210, 156], 1 + (r() - 0.5) * 0.07));
  paint(T.TALLGRASS, 22, (x, y, r) => {
    const hh = 5 + Math.floor(H(x, 0, 101) * 9);
    if (x % 2 === 0 && H(x, 1, 102) < 0.2) return [0, 0, 0, 0];
    const top = 16 - hh;
    if (y < top) return [0, 0, 0, 0];
    const t = (y - top) / hh;
    return var_([70 + t * 25, 140 + t * 20, 40 + t * 8], 14, r);
  });
  const flower = (petal, center) => (x, y, r) => {
    if ((x === 7 || x === 8) && y >= 7) return var_([60, 130, 40], 12, r);
    if (x === 9 && y === 11) return var_([60, 130, 40], 12, r);
    if (x === 6 && y === 10) return var_([60, 130, 40], 12, r);
    if (x >= 5 && x <= 10 && y >= 3 && y <= 7) {
      if ((x === 5 || x === 10) && (y === 3 || y === 7)) return [0, 0, 0, 0];
      if (x >= 7 && x <= 8 && y >= 4 && y <= 6) return var_(center, 10, r);
      return var_(petal, 14, r);
    }
    return [0, 0, 0, 0];
  };
  paint(T.ROSE, 23, flower([196, 20, 24], [255, 210, 40]));
  paint(T.DANDELION, 24, flower([252, 220, 30], [250, 180, 20]));
  paint(T.CACTUS_SIDE, 25, (x, y, r) => {
    if (x === 0 || x === 15) return mul([10, 85, 25], 0.9 + r() * 0.2);
    let f = 1 + (r() - 0.5) * 0.12;
    if (x % 4 === 2) f *= 0.82;
    if (H(x, y, 111) < 0.07) return [200, 215, 160, 255];
    return mul([18, 128, 38], f);
  });
  paint(T.CACTUS_TOP, 26, (x, y, r) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return mul([10, 85, 25], 1 + r() * 0.15);
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    return mul([30, 150, 48], (d < 4 ? 1.12 : 0.95) + (r() - 0.5) * 0.1);
  });
  paint(T.GOLD, 27, ore(303, [241, 197, 48]));
  paint(T.DIAMOND, 28, ore(404, [66, 229, 222]));
  for (const [tile, col] of [[T.IRON_BLOCK, [214, 220, 218]], [T.GOLD_BLOCK, [239, 194, 43]], [T.DIAMOND_BLOCK, [58, 208, 199]]]) {
    paint(tile, tile, (x, y, r) => mul(col, (x === 0 || y === 0 ? 1.15 : x === 15 || y === 15 ? 0.65 : 1) + (r() - 0.5) * 0.07));
  }
  paint(T.PUMPKIN, 41, (x, y, r) => {
    if ((y >= 4 && y <= 6 && (x >= 3 && x <= 5 || x >= 10 && x <= 12)) || (y >= 10 && y <= 12 && x >= 4 && x <= 11 && (y !== 10 || x % 2))) return [54, 35, 17];
    return mul([222, 117, 26], 0.85 + (x % 4) * 0.08 + r() * 0.08);
  });
  paint(T.PUMPKIN_TOP, 42, (x, y, r) => x >= 6 && x <= 9 && y >= 6 && y <= 9 ? [75, 88, 29] : var_([209, 124, 29], 15, r));
  paint(T.WOOL, 43, (x, y, r) => var_([225, 224, 214], (x + y) % 2 ? 20 : 8, r));
  paint(T.MOSS, 44, (x, y, r) => H(x >> 1, y >> 1, 44) < 0.4 ? var_([66, 105, 46], 15, r) : var_([105, 110, 98], 25, r));
  paint(T.CLAY, 45, (x, y, r) => var_([153, 164, 180], 10, r));
  paint(T.OBSIDIAN, 46, (x, y, r) => var_([36, 23, 53], 16, r));
  paint(T.WORKBENCH, 47, (x, y, r) => x % 5 === 0 || y % 5 === 0 ? [78, 49, 25] : var_([161, 111, 58], 13, r));
  paintItemTextures(ctx);
  return cv;
}
