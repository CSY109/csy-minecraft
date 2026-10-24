'use strict';

// Items share the hotbar with blocks, but can never be placed as voxels.
const I = {}, ITEMS = {};
function defItem(key, name, opts = {}) {
  const id = 128 + Object.keys(ITEMS).length;
  I[key] = id; ITEMS[id] = { name, ...opts }; NAMES[id] = name;
  TOP[id] = BOT[id] = SIDE[id] = 48 + id - 128;
}
defItem('STICK', '木棍', { color: '#9b6939' });
defItem('COAL', '煤炭', { color: '#33343a' });
defItem('RAW_IRON', '粗铁', { color: '#bc8b72' });
defItem('INGOT', '铁锭', { color: '#d7e1e1' });
defItem('GOLD', '金锭', { color: '#efd046' });
defItem('DIAMOND', '钻石', { color: '#42dfda' });
defItem('MEAT', '生肉', { food: 4, color: '#ce6962' });
defItem('COOKED', '熟肉', { food: 8, color: '#ad643a' });
defItem('APPLE', '苹果', { food: 4, color: '#e64c43' });
defItem('STRING', '蛛丝', { color: '#e2e1d4' });
defItem('ARROW', '箭', { color: '#c9c8b4' });
for (const [material, label, tier, color] of [['WOOD', '木', 1, '#b78b54'], ['STONE', '石', 2, '#a1a7a9'], ['IRON', '铁', 3, '#dde5e7'], ['DIAMOND', '钻石', 4, '#42dfda']]) {
  for (const [tool, name] of [['PICK', '镐'], ['AXE', '斧'], ['SHOVEL', '锹'], ['SWORD', '剑']]) {
    defItem(material + '_' + tool, label + name, { tool: tool.toLowerCase(), tier, speed: [1, 2.5, 4, 6, 9][tier], damage: tool === 'SWORD' ? 2 + tier * 2 : 1 + tier, color });
  }
}
defItem('BOW', '弓', { tool: 'bow', damage: 7, color: '#b88b50' });
for (const [key, name, mob, color] of [['PIG_EGG', '猪刷怪蛋', 'pig', '#eea6ac'], ['COW_EGG', '牛刷怪蛋', 'cow', '#795741'], ['SHEEP_EGG', '羊刷怪蛋', 'sheep', '#eee9dc'], ['ZOMBIE_EGG', '僵尸刷怪蛋', 'zombie', '#639844'], ['SPIDER_EGG', '蜘蛛刷怪蛋', 'spider', '#473532'], ['CREEPER_EGG', '苦力怕刷怪蛋', 'creeper', '#61ac45']]) {
  defItem(key, name, { mob, color, creativeOnly: true });
}

defItem('FLINT', '燧石', { color: '#66676c' });
defItem('FLINT_STEEL', '打火石', { action: 'ignite', color: '#a3a5aa' });
defItem('BUCKET', '铁桶', { action: 'bucket', color: '#b9c0c3' });
defItem('WATER_BUCKET', '水桶', { action: 'water', color: '#466bd0' });
defItem('LAVA_BUCKET', '熔岩桶', { action: 'lava', color: '#ed8133' });
defItem('GUNPOWDER', '火药', { color: '#65605b' });
defItem('EXPLOSIVE_ARROW', '爆炸箭', { ammo: true, color: '#cd4436' });
ITEMS[I.ARROW].ammo = true;
const BLOCK_INFO = {};
function material(ids, hardness, tool, tier = 0, sound = tool) {
  for (const id of ids) BLOCK_INFO[id] = { hardness, tool, tier, sound };
}
material([B.GRASS, B.DIRT, B.SAND, B.GRAVEL, B.SNOWGRASS, B.CLAY], 0.7, 'shovel', 0, 'earth');
material([B.SNOW], 0.45, 'shovel', 0, 'snow');
material([B.LOG, B.PLANKS, B.WORKBENCH], 2.2, 'axe', 0, 'wood');
material([B.PUMPKIN], 1.1, 'axe', 0, 'wood');
material([B.STONE, B.COBBLE, B.SANDSTONE, B.MOSS, B.BRICK], 2.5, 'pick', 1, 'stone');
material([B.COAL], 3, 'pick', 1, 'stone');
material([B.IRON, B.IRON_BLOCK], 4, 'pick', 2, 'metal');
material([B.GOLD, B.GOLD_BLOCK, B.DIAMOND, B.DIAMOND_BLOCK], 5, 'pick', 3, 'metal');
material([B.OBSIDIAN], 18, 'pick', 4, 'stone');
material([B.GLASS], 0.4, '', 0, 'glass');
material([B.LEAVES, B.TALLGRASS, B.ROSE, B.DANDELION, B.CACTUS], 0.25, 'axe', 0, 'grass');
material([B.WOOL], 0.8, '', 0, 'snow');
material([B.BEDROCK], Infinity, '', 99, 'stone');
material([B.NETHERRACK], 0.6, 'pick', 1, 'stone');
material([B.SOUL_SAND], 0.8, 'shovel', 0, 'earth');
material([B.NETHER_BRICK, B.QUARTZ, B.MAGMA], 2.6, 'pick', 1, 'stone');
material([B.GLOWSTONE], 0.5, '', 0, 'glass');
material([B.TORCH, B.FIRE], 0.05, '', 0, 'wood');
function miningSeconds(id, held) {
  const b = BLOCK_INFO[id] || { hardness: 1, tool: '' }, item = ITEMS[held];
  let seconds = b.hardness;
  if (item && item.tool === b.tool) seconds /= item.speed;
  else if (b.tool === 'pick') seconds *= 3;
  return seconds;
}
function harvestable(id, held) {
  const b = BLOCK_INFO[id], item = ITEMS[held];
  return !b || !b.tier || !!(item && item.tool === b.tool && item.tier >= b.tier);
}
function blockDrop(id) {
  return ({ [B.STONE]: B.COBBLE, [B.GRASS]: B.DIRT, [B.SNOWGRASS]: B.DIRT,
    [B.COAL]: I.COAL, [B.IRON]: I.RAW_IRON, [B.GOLD]: I.GOLD, [B.DIAMOND]: I.DIAMOND,
    [B.GRAVEL]: Math.random() < 0.15 ? I.FLINT : B.GRAVEL,
    [B.GLASS]: 0, [B.FIRE]: 0, [B.TALLGRASS]: 0, [B.LEAVES]: Math.random() < 0.18 ? I.APPLE : 0 })[id] ?? id;
}

const RECIPES = [];
function recipe(out, count, ingredients, bench = false, category = '材料') { RECIPES.push({ out, count, ingredients, bench, category }); }
recipe(B.PLANKS, 4, [[B.LOG, 1]]);
recipe(I.STICK, 4, [[B.PLANKS, 2]]);
recipe(B.TORCH, 4, [[I.STICK, 1], [I.COAL, 1]]);
recipe(B.WORKBENCH, 1, [[B.PLANKS, 4]]);
recipe(I.INGOT, 1, [[I.RAW_IRON, 1], [I.COAL, 1]], false, '冶炼');
recipe(I.COOKED, 3, [[I.MEAT, 3], [I.COAL, 1]], false, '冶炼');
recipe(B.GLASS, 4, [[B.SAND, 4], [I.COAL, 1]], false, '冶炼');
recipe(B.BRICK, 4, [[B.CLAY, 4], [I.COAL, 1]], false, '冶炼');
recipe(B.IRON_BLOCK, 1, [[I.INGOT, 9]]);
recipe(I.INGOT, 9, [[B.IRON_BLOCK, 1]]);
recipe(B.GOLD_BLOCK, 1, [[I.GOLD, 9]]);
recipe(B.DIAMOND_BLOCK, 1, [[I.DIAMOND, 9]]);
for (const [mat, ingredient] of [['WOOD', B.PLANKS], ['STONE', B.COBBLE], ['IRON', I.INGOT], ['DIAMOND', I.DIAMOND]]) {
  for (const [tool, amount] of [['PICK', 3], ['AXE', 3], ['SHOVEL', 1], ['SWORD', 2]]) {
    recipe(I[mat + '_' + tool], 1, [[ingredient, amount], [I.STICK, tool === 'SWORD' ? 1 : 2]], true, '工具与武器');
  }
}
recipe(I.BOW, 1, [[I.STICK, 3], [I.STRING, 3]], true, '工具与武器');
recipe(I.ARROW, 8, [[I.STICK, 2], [B.COBBLE, 1]], false, '工具与武器');
recipe(I.EXPLOSIVE_ARROW, 4, [[I.ARROW, 4], [I.GUNPOWDER, 1]], false, '工具与武器');
recipe(I.FLINT_STEEL, 1, [[I.INGOT, 1], [I.FLINT, 1]], false, '工具与武器');
recipe(I.BUCKET, 1, [[I.INGOT, 3]], true, '工具与武器');

function paintItemTextures(ctx) {
  for (const [id, item] of Object.entries(ITEMS)) {
    const tile = TOP[id], ox = (tile & 15) * 16, oy = (tile >> 4) * 16;
    ctx.save(); ctx.translate(ox, oy); ctx.fillStyle = item.color;
    const rect = (x, y, w, h, color) => { ctx.fillStyle = color || item.color; ctx.fillRect(x, y, w, h); };
    if (item.tool && item.tool !== 'bow') {
      for (let k = 0; k < 9; k++) rect(3 + k, 12 - k, 2, 2, '#78502d');
      if (item.tool === 'sword') {
        for (let k = 0; k < 8; k++) rect(6 + k, 8 - k, 3, 3);
        rect(4, 8, 6, 2, '#674c30');
      } else if (item.tool === 'pick') { rect(3, 2, 10, 3); rect(11, 4, 3, 3); }
      else if (item.tool === 'axe') { rect(6, 1, 7, 6); rect(9, 5, 4, 3); }
      else rect(9, 1, 5, 5);
    } else if (item.tool === 'bow') {
      rect(5, 1, 3, 2); rect(8, 3, 2, 3); rect(10, 6, 2, 4); rect(8, 10, 2, 3); rect(5, 13, 3, 2); rect(5, 2, 1, 12, '#e0dac9');
    } else if (Number(id) === I.ARROW || Number(id) === I.STICK) {
      for (let k = 0; k < 11; k++) rect(2 + k, 13 - k, 2, 2);
      if (Number(id) === I.ARROW) rect(10, 1, 4, 4, '#e0e4e5');
    } else {
      rect(4, 3, 8, 10); rect(2, 5, 12, 6); rect(5, 4, 3, 2, '#ffffff80');
      if (item.mob) { rect(5, 7, 2, 2, '#42332d'); rect(9, 10, 2, 2, '#42332d'); }
      if (Number(id) === I.APPLE) rect(8, 1, 2, 3, '#69883d');
    }
    ctx.restore();
  }
}
