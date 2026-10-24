const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('../server.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const launch = { headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  if (process.env.TEST_BROWSER) launch.executablePath = process.env.TEST_BROWSER;
  let browser;
  try {
    browser = await chromium.launch(launch);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); console.error('Browser error:', e.message); });
    // Fixed simulation steps make combat, mining and pause checks deterministic.
    await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.screenshot({ path: path.join(__dirname, '..', 'test-results', 'cover-desktop.png') });
    await page.locator('#settingsButton').click();
    await page.locator('#seed').fill('12345');
    await page.locator('#rd').fill('3');
    await page.locator('#closeSettings').click();
    await page.locator('#play').click();
    await page.waitForFunction(() => started, null, { polling: 100 });
    await page.evaluate(() => { updateSky(); updateHUD(); drawWorld(0); document.exitPointerLock(); });
    const results = await page.evaluate(() => {
      const results = [];
      function assert(value, message) { if (!value) throw new Error(message); }
      function test(name, fn) { try { fn(); results.push({ name, pass: true }); } catch (e) { results.push({ name, pass: false, error: e.message }); } }
      const naturalWorld = world, originalPlayer = player.p.slice();
      function arena() {
        world = new World(12345);
        for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) {
          const c = new Chunk(cx, cz); c.gen = true; c.maxY = 10; c.hm.fill(10);
          for (let y = 0; y <= 10; y++) c.blocks.fill(y === 0 ? B.BEDROCK : B.DIRT, y * 256, (y + 1) * 256);
          world.chunks.set(world.key(cx, cz), c);
        }
        mobs.length = 0; projectiles.length = 0; particles.length = 0;
        for (const key of Object.keys(bag)) delete bag[key];
        hotbar.fill(0); sel = 0; gameMode = 'survival'; player.p = [0.5, 11.01, 0.5]; player.v = [0, 0, 0]; player.fly = false; player.onGround = true;
        resetVitals(); vitals.fallTop = player.p[1]; target = null; mobTarget = null; mouseL = mouseR = false; resetMining(); cancelBow(); selectedArrow = I.ARROW; combatClock = 0;
      }
      test('world starts with animals, food, survival HUD and real WebGL', () => {
        assert(gameMode === 'survival' && countItem(I.APPLE) === 4, 'survival starter kit');
        assert(mobs.length > 0 && mobs.every(m => MOB_TYPES[m.type].animal), 'initial animals');
        assert(gl.getError() === gl.NO_ERROR, 'WebGL draw error');
        assert(!$('vitals').hidden && !player.fly, 'HUD and flying');
      });
      test('classic sprites preserve silhouettes and item models have pixel edge thickness', () => {
        for (const id of Object.keys(ITEMS).map(Number)) {
          const t = TOP[id], pixels = atlasCanvas.getContext('2d').getImageData((t & 15) * 16, (t >> 4) * 16, 16, 16).data;
          let opaque = 0; for (let a = 3; a < pixels.length; a += 4) if (pixels[a] > 127) opaque++;
          assert(opaque > 10 && opaque < 256, 'missing sprite or opaque square: ' + NAMES[id]);
          const mesh = buildBlockMesh(id); assert(mesh.n > 12, 'flat item without edge walls: ' + NAMES[id]); freeMeshBuf(mesh);
        }
        assert(Object.keys(skinRects).includes('sheep_fur') && Object.keys(skinRects).includes('iron_golem'), 'layered entity skins loaded');
      });
      test('resource collection → planks → sticks → placed workbench → wooden pickaxe', () => {
        arena(); world.setBlock(2, 11, 0, B.LOG); target = { x: 2, y: 11, z: 0, id: B.LOG }; breakBlock();
        assert(countItem(B.LOG) === 1 && world.getBlock(2, 11, 0) === 0, 'log collected');
        craft(RECIPES.find(r => r.out === B.PLANKS));
        assert(countItem(B.LOG) === 0 && countItem(B.PLANKS) === 4, 'planks cost');
        craft(RECIPES.find(r => r.out === B.WORKBENCH));
        world.setBlock(3, 11, 0, B.WORKBENCH); bag[B.WORKBENCH] = 0;
        addItem(B.LOG, 2); craft(RECIPES.find(r => r.out === B.PLANKS)); craft(RECIPES.find(r => r.out === B.PLANKS));
        craft(RECIPES.find(r => r.out === I.STICK));
        const pick = RECIPES.find(r => r.out === I.WOOD_PICK);
        assert(canCraft(pick), 'pick requires available ingredients and workbench'); craft(pick);
        assert(countItem(I.WOOD_PICK) === 1 && countItem(I.STICK) === 2, 'pick crafted');
        player.p = [12.5, 11, 0.5]; assert(!canCraft(pick), 'cannot craft far from bench');
      });
      test('mining time, progress reset, tier drops, bedrock and snow harvesting', () => {
        arena();
        assert(miningSeconds(B.DIRT, I.WOOD_SHOVEL) < miningSeconds(B.DIRT, 0), 'shovel speed');
        assert(miningSeconds(B.STONE, I.WOOD_PICK) < miningSeconds(B.STONE, 0), 'pick speed');
        assert(miningSeconds(B.STONE, I.DIAMOND_PICK) < miningSeconds(B.STONE, I.WOOD_PICK), 'tool tiers');
        assert(miningSeconds(B.LOG, I.IRON_AXE) < miningSeconds(B.LOG, I.IRON_PICK), 'axe speed');
        assert(!harvestable(B.DIAMOND, I.STONE_PICK) && harvestable(B.DIAMOND, I.IRON_PICK), 'diamond tier');
        assert(!harvestable(B.BEDROCK, I.DIAMOND_PICK), 'bedrock protected');
        world.setBlock(2, 11, 0, B.STONE); target = { x: 2, y: 11, z: 0, id: B.STONE, t: 2 };
        mouseL = true; updateMining(0.1); assert(world.getBlock(2, 11, 0) === B.STONE && mining.elapsed > 0, 'no instant break');
        mouseL = false; updateMining(0); assert(mining.elapsed === 0, 'release resets progress');
        bag[I.WOOD_PICK] = 1; hotbar[0] = I.WOOD_PICK; mouseL = true;
        updateMining(1.1); assert(world.getBlock(2, 11, 0) === 0 && countItem(B.COBBLE) === 1, 'correct mined drop');
        world.setBlock(2, 11, 0, B.DIAMOND); target.id = B.DIAMOND; breakBlock(); assert(countItem(I.DIAMOND) === 0, 'wrong-tier no drop');
        world.setBlock(2, 11, 0, B.SNOWGRASS); target.id = B.SNOWGRASS; hotbar[0] = I.WOOD_SHOVEL; bag[I.WOOD_SHOVEL] = 1; breakBlock();
        assert(countItem(B.SNOW) === 1, 'snow obtainable from snowy grass');
      });
      test('placement spends stock; empty slots and tools cannot place blocks', () => {
        arena(); bag[B.PLANKS] = 1; hotbar[0] = B.PLANKS;
        target = { x: 3, y: 10, z: 0, id: B.DIRT, nx: 0, ny: 1, nz: 0 }; placeBlock();
        assert(world.getBlock(3, 11, 0) === B.PLANKS && countItem(B.PLANKS) === 0, 'placement consumes');
        target.x = 4; placeBlock(); assert(world.getBlock(4, 11, 0) === B.AIR, 'no duplicate free block');
        hotbar[0] = I.WOOD_PICK; bag[I.WOOD_PICK] = 1; placeBlock(); assert(world.getBlock(4, 11, 0) === B.AIR, 'tools cannot be voxels');
      });
      test('iron and snow golems consume valid structures in both orientations', () => {
        for (const [dx, dz] of [[1, 0], [0, 1]]) {
          arena(); const x = 5, z = 5;
          for (const p of [[x, 11, z], [x, 12, z], [x - dx, 12, z - dz], [x + dx, 12, z + dz]]) world.setBlock(...p, B.IRON_BLOCK);
          world.setBlock(x, 13, z, B.PUMPKIN); assert(trySummonGolem(x, 13, z), 'iron T orientation');
          assert(mobs[0].type === 'iron_golem' && world.getBlock(x, 13, z) === 0 && world.getBlock(x - dx, 12, z - dz) === 0, 'consume iron structure');
          assert(!trySummonGolem(x, 13, z) && mobs.length === 1, 'no duplicate summon');
        }
        arena(); world.setBlock(5, 11, 5, B.SNOW); world.setBlock(5, 12, 5, B.SNOW); world.setBlock(5, 13, 5, B.PUMPKIN);
        assert(trySummonGolem(5, 13, 5) && mobs[0].type === 'snow_golem', 'snow stack');
        arena(); world.setBlock(5, 11, 5, B.IRON_BLOCK); world.setBlock(5, 12, 5, B.IRON_BLOCK); world.setBlock(5, 13, 5, B.PUMPKIN);
        assert(!trySummonGolem(5, 13, 5) && world.getBlock(5, 13, 5) === B.PUMPKIN, 'incomplete pattern stays intact');
      });
      test('combat obeys walls, sword damage and attack cooldowns', () => {
        arena(); const zombie = spawnMob('zombie', 0.5, 11.02, -2.5);
        const e = eyePos(), dir = [0, 0, -1]; mobTarget = findMobTarget(e, dir, 4.5);
        assert(mobTarget?.mob === zombie, 'mob aimed');
        bag[I.IRON_SWORD] = 1; hotbar[0] = I.IRON_SWORD; attackMob(); const hp = zombie.hp;
        assert(hp === 12, 'iron sword damage'); attackMob(); assert(zombie.hp === hp, 'cooldown');
        world.setBlock(0, 12, -1, B.STONE); const hit = world.raycast(...e, ...dir, 5);
        assert(!findMobTarget(e, dir, 4.5, hit.t), 'wall blocks attacks');
      });
      test('iron golem attacks hostiles; snow golem throws damaging snowballs', () => {
        arena(); spawnMob('iron_golem', 5.5, 11.02, 5.5); const zombie = spawnMob('zombie', 5.5, 11.02, 7.4);
        sky.d = 0.2; updateMobs(0.05); assert(zombie.hp < 20, 'iron golem defended');
        arena(); spawnMob('snow_golem', 5.5, 11.02, 4.5); const targetMob = spawnMob('zombie', 5.5, 11.02, 10.5);
        updateMobs(0.05); assert(projectiles.some(p => p.type === 'snowball'), 'snowball created');
        for (let i = 0; i < 20; i++) updateProjectiles(0.025);
        assert(targetMob.hp < 20, 'snowball hit');
      });
      test('bow draws without spending ammo and cancels safely; arrows hit creatures', () => {
        arena(); hotbar[0] = I.BOW; bag[I.BOW] = 1; bag[I.ARROW] = 1; player.yaw = 0; player.pitch = 0;
        const zombie = spawnMob('zombie', 0.5, 11.02, -4.5); mouseR = true; useHeldItem(); updateBow(0.7);
        assert(bow.active && bow.elapsed === 0.7 && countItem(I.ARROW) === 1 && !projectiles.length, 'draw does not spend or fire');
        releaseBow(); assert(!bow.active && countItem(I.ARROW) === 1 && !projectiles.length, 'unlocked release is cancelled');
        useHeldItem(); selectSlot(1); assert(!bow.active && countItem(I.ARROW) === 1, 'switching item cancels'); selectSlot(0);
        shootProjectile(eyePos(), lookDir(), 'arrow', null, 7, 30);
        for (let i = 0; i < 12; i++) updateProjectiles(0.025);
        assert(zombie.hp === 13, 'arrow damage'); bag[I.ARROW] = 0; useHeldItem(); assert(!bow.active && projectiles.length === 0, 'no ammo no draw');
        for (const tile of BOW_PULL_TILES) { const mesh = buildBlockMesh(I.BOW, tile); assert(mesh.n > 12, 'pulling sprite extruded'); freeMeshBuf(mesh); }
      });
      test('creepers drop gunpowder and explosive arrows craft with exact ingredient costs', () => {
        arena(); const creeper = spawnMob('creeper', 6.5, 11.01, 6.5); damageMob(creeper, 100);
        assert(countItem(I.GUNPOWDER) >= 1, 'creeper drops gunpowder');
        bag[I.GUNPOWDER] = 1; bag[I.ARROW] = 4;
        const recipe = RECIPES.find(r => r.out === I.EXPLOSIVE_ARROW); assert(canCraft(recipe), 'explosive arrow recipe accessible'); craft(recipe);
        assert(countItem(I.EXPLOSIVE_ARROW) === 4 && !countItem(I.GUNPOWDER) && !countItem(I.ARROW), 'four arrows plus powder makes four explosive arrows');
        assert(!canCraft(recipe), 'cannot craft without ingredients');
      });
      test('explosive blast breaks exactly a five-cell cube across chunks and deals exactly 20 damage', () => {
        arena(); const center = [15, 15, 0];
        for (let y = 12; y <= 18; y++) for (let z = -3; z <= 3; z++) for (let x = 12; x <= 18; x++) world.setBlock(x, y, z, B.STONE);
        world.setBlock(14, 15, 0, B.BEDROCK); world.setBlock(15, 15, 0, B.OBSIDIAN); world.setBlock(16, 15, 0, B.WATER);
        const golem = spawnMob('iron_golem', 15.5, 15, 0.5), outside = spawnMob('iron_golem', 19, 15, 0.5);
        explodeArrow(...center); let broken = 0;
        for (let y = 12; y <= 18; y++) for (let z = -3; z <= 3; z++) for (let x = 12; x <= 18; x++) {
          const inside = x >= 13 && x <= 17 && y >= 13 && y <= 17 && z >= -2 && z <= 2;
          const protectedCell = y === 15 && z === 0 && x >= 14 && x <= 16;
          const id = world.getBlock(x, y, z);
          if (inside && !protectedCell) { assert(id === 0, 'in-range block survived: ' + [x, y, z]); broken++; }
          else assert(id !== 0, 'protected or outside block destroyed');
        }
        assert(broken === 122 && golem.hp === 80 && outside.hp === 100, '125 cells minus three protected; fixed damage only in range');
        assert(world.edits.has('1,0') && world.edits.has('0,-1'), 'cross-chunk edits tracked');
        assert(particles.length >= 60 && particles.some(p => p.gravity === -0.2), 'fire and smoke effects');
      });
      test('explosive arrow detonates once on a mob or wall; expired arrows never explode', () => {
        for (const wall of [false, true]) {
          arena(); gameMode = 'creative'; const golem = spawnMob('iron_golem', 5.5, 11.01, 5.5);
          if (wall) world.setBlock(5, 12, 4, B.STONE);
          shootProjectile([5.5, 12.1, 0.5], [0, 0, 1], 'explosive_arrow', null, 20, 30);
          for (let n = 0; n < 16; n++) updateProjectiles(0.025);
          assert(golem.hp === 80 && !projectiles.length, 'one blast causes 20 damage for ' + (wall ? 'wall impact' : 'direct hit'));
          const particleCount = particles.length; updateProjectiles(1); assert(particles.length === particleCount, 'removed arrow cannot explode again');
        }
        arena(); world.setBlock(5, 12, 2, B.STONE);
        shootProjectile([5.5, 12.1, 0.5], [0, 0, 1], 'explosive_arrow', null, 20, 30); projectiles[0].life = 0.01;
        updateProjectiles(0.1); assert(world.getBlock(5, 12, 2) === B.STONE && !particles.length, 'expired arrow removed without impact');
      });
      test('blast damages survival players and preserves creative immunity', () => {
        arena(); player.p = [5.5, 11.01, 5.5]; vitals.health = 40; explodeArrow(5, 12, 5);
        assert(vitals.health === 20, 'player takes exactly 20');
        gameMode = 'creative'; vitals.invulnerable = 0; explodeArrow(5, 12, 5); assert(vitals.health === 20, 'creative immunity');
      });
      test('animals roll onto their side, stop acting, drop once and disappear in white puffs', () => {
        for (const type of ['pig', 'cow', 'sheep']) {
          arena(); const animal = spawnMob(type, 4.5, 11.02, 0.5); const x = animal.x, z = animal.z;
          damageMob(animal, 100, player.p);
          assert(animal.dying && animal.hp === 0 && countItem(I.MEAT) === 2, 'death begins with one drop');
          damageMob(animal, 100); assert(countItem(I.MEAT) === 2, 'corpse cannot duplicate drops');
          assert(!findMobTarget([4.5, 11.4, 3], [0, 0, -1], 5), 'corpse is not targetable');
          for (let n = 0; n < 6; n++) updateMobs(0.05);
          assert(mobs.includes(animal) && mobDeathAngle(animal) > 0.5 && mobDeathAngle(animal) < Math.PI / 2, 'body remains while rolling');
          assert(animal.x === x && animal.z === z, 'dead animal cannot walk or flee');
          drawMobs(vp, eyePos(), 1, sky.hor, 16, 80); assert(gl.getError() === gl.NO_ERROR, 'dying body renders');
          for (let n = 0; n < 10; n++) updateMobs(0.05);
          assert(mobDeathAngle(animal) === Math.PI / 2 && mobs.includes(animal), 'body rests sideways briefly');
          for (let n = 0; n < 6; n++) updateMobs(0.05);
          assert(!mobs.includes(animal) && particles.some(p => p.gravity === -0.2), 'body replaced with floating white particles');
          assert(countItem(I.MEAT) === 2 && (type !== 'sheep' || countItem(B.WOOL) === 2), 'drops stay unchanged');
        }
      });
      test('hunger, eating, falling, drowning, death and creative immunity', () => {
        arena(); vitals.hunger = 10; hotbar[0] = I.APPLE; bag[I.APPLE] = 2; useHeldItem();
        assert(vitals.hunger === 14 && countItem(I.APPLE) === 1, 'food consumed');
        vitals.fallTop = 19; updateVitals(0.05); assert(vitals.health < 20, 'fall damage');
        vitals.invulnerable = 0; vitals.air = 0; player.eyeWater = true; vitals.hazard = 1; const hp = vitals.health; updateVitals(0.05);
        assert(vitals.health < hp, 'drowning'); player.eyeWater = false;
        vitals.invulnerable = 0; damagePlayer(30, '测试'); assert(dead && !$('death').hidden, 'death overlay');
        resetVitals(); gameMode = 'creative'; damagePlayer(30); assert(!dead && vitals.health === 20, 'creative invulnerable');
      });
      test('night spawns hostiles; unloading preserves edits; mesh all new blocks', () => {
        world = naturalWorld; player.p = originalPlayer.slice(); mobs.length = 0; sky.d = 0.1;
        for (let i = 0; i < 8; i++) naturalSpawn(); assert(mobs.some(m => MOB_TYPES[m.type].hostile), 'night spawning');
        const x = Math.floor(player.p[0]), z = Math.floor(player.p[2]), cx = x >> 4, cz = z >> 4;
        world.setBlock(x, 80, z, B.IRON_BLOCK); world.setBlock(x, 20, z, B.AIR);
        const old = world.getChunk(cx, cz); freeChunkMesh(old); world.chunks.delete(world.key(cx, cz)); world.generate(cx, cz);
        assert(world.getBlock(x, 80, z) === B.IRON_BLOCK && world.getBlock(x, 20, z) === 0, 'edits retained');
        for (const id of [...INVENTORY_BLOCKS, ...Object.keys(ITEMS).map(Number)]) { const mesh = buildBlockMesh(id); assert(mesh?.n > 0, 'missing geometry: ' + NAMES[id]); freeMeshBuf(mesh); }
      });
      test('pause freezes world time, creatures and survival needs', () => {
        document.exitPointerLock(); const clock = gameTime, hunger = vitals.hunger, positions = mobs.map(m => m.x);
        last = performance.now() - 50; frame(performance.now());
        assert(gameTime === clock && vitals.hunger === hunger && mobs.every((m, i) => m.x === positions[i]), 'paused simulation changed');
        assert(gl.getError() === gl.NO_ERROR, 'final render WebGL error');
      });
      test('mining darkens the block with staged cracks, emits chips, and clears on release', () => {
        arena(); player.yaw = 0; player.pitch = -0.04; player.p = [0.5, 11.01, 4.5];
        world.setBlock(0, 11, 1, B.STONE); world.setBlock(0, 12, 1, B.STONE);
        for (const c of world.chunks.values()) if (world.canMesh(c)) uploadChunk(c, world.meshChunk(c));
        target = world.raycast(...eyePos(), ...lookDir(), 5); assert(target?.id === B.STONE, 'aim stone face');
        sky.d = 1; updateSky(); mouseL = true; updateMining(0.2);
        assert(mining.stage >= 0 && particles.length > 0, 'crack stage and ongoing chips');
        particles.length = 0; swing = 0;
        const pixelCount = canvas.width * canvas.height * 4;
        const before = new Uint8Array(pixelCount), after = new Uint8Array(pixelCount);
        mining.stage = -1; drawWorld(0); gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, before);
        mining.stage = 8; drawWorld(0); gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, after);
        let darkened = 0; for (let i = 0; i < pixelCount; i += 4) if (after[i] + after[i + 1] + after[i + 2] < before[i] + before[i + 1] + before[i + 2] - 25) darkened++;
        assert(darkened > 500, 'cracks are visible on GPU surface');
        mouseL = false; updateMining(0); assert(mining.stage === -1, 'release clears cracks');
        assert(!document.getElementById('mining') && !document.getElementById('targetInfo') && !document.getElementById('gameStatus'), 'no progress bar or persistent text overlays');
        assert(gl.getParameter(gl.DEPTH_WRITEMASK) === true && gl.getError() === gl.NO_ERROR, 'renderer state restored');
      });
      test('pixel HUD supports half hearts, hunger and underwater bubbles', () => {
        gameMode = 'survival'; resetVitals(); player.eyeWater = false; updateHUD();
        const c = $('vitals').getContext('2d'), full = c.getImageData(72, 11, 9, 9).data;
        vitals.health = 19; vitals.hunger = 13; hudStamp = ''; updateHUD();
        const half = c.getImageData(72, 11, 9, 9).data;
        assert(full.some((v, i) => v !== half[i]), 'half-heart sprite differs from full');
        assert(c.getImageData(0, 0, 182, 9).data.every(v => v === 0), 'air row hidden on land');
        player.eyeWater = true; vitals.air = 6; updateHUD();
        assert(c.getImageData(100, 0, 82, 9).data.some(v => v !== 0), 'air bubbles appear underwater');
        assert($('vitals').getAttribute('aria-label').includes('19/20'), 'HUD values accessible without visible labels');
        player.eyeWater = false; resetVitals();
      });
      // Leave a useful overview for screenshot review.
      gameMode = 'creative'; resetVitals(); world = naturalWorld; player.p = originalPlayer.slice(); updateSky();
      mobs.length = 0; naturalSpawn(true); $('menu').style.display = 'none'; document.body.classList.add('playing');
      hotbar.splice(0, 9, I.IRON_SWORD, I.DIAMOND_PICK, I.BOW, B.PLANKS, B.IRON_BLOCK, B.SNOW, B.PUMPKIN, I.PIG_EGG, I.APPLE); refreshHotbar();
      clearTimeout(toastT); $('toast').style.opacity = 0;
      updateHUD(); drawWorld(0);
      return results;
    });
    for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.error ? ': ' + r.error : ''}`);
    fs.mkdirSync(path.join(__dirname, '..', 'test-results'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, '..', 'test-results', 'world.png') });
    await page.keyboard.press('KeyE');
    await page.screenshot({ path: path.join(__dirname, '..', 'test-results', 'inventory.png') });
    // Search fields must accept E and digit keys without triggering gameplay shortcuts.
    await page.locator('#invSearch').fill('铁');
    const matching = await page.locator('#recipes .recipe').count(); assert(matching > 0, 'search finds iron recipes');
    await page.locator('#invSearch').pressSequentially('e1');
    assert(await page.evaluate(() => invOpen), 'typing E must not close inventory');
    await page.evaluate(() => {
      invOpen = false; $('inv').style.display = 'none'; $('menu').style.display = 'none';
      world = new World(2048);
      for (let cz = -2; cz <= 2; cz++) for (let cx = -2; cx <= 2; cx++) {
        const chunk = new Chunk(cx, cz); chunk.gen = true; chunk.maxY = 10; chunk.hm.fill(10);
        for (let y = 0; y <= 10; y++) chunk.blocks.fill(y === 10 ? B.GRASS : B.DIRT, y * 256, (y + 1) * 256);
        world.chunks.set(world.key(cx, cz), chunk);
      }
      for (const chunk of world.chunks.values()) if (world.canMesh(chunk)) uploadChunk(chunk, world.meshChunk(chunk));
      gameMode = 'creative'; gameTime = 0; mobs.length = 0; projectiles.length = 0;
      player.p = [0.5, 11.01, 4.5]; player.yaw = 0; player.pitch = -0.03;
      for (const [type, x, z] of [['pig', -2.5, -0.5], ['cow', 0, -1.5], ['sheep', 2.5, -0.5], ['iron_golem', -5.5, -5.5], ['snow_golem', 5.5, -5.5], ['zombie', -2, -7], ['creeper', 0, -7.5], ['spider', 2, -7]]) {
        const m = spawnMob(type, x, 11.02, z); m.yaw = 0;
      }
      $('toast').style.opacity = 0; target = mobTarget = null; updateSky(); updateHUD(); drawWorld(0);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Classic model gallery WebGL error');
    });
    await page.screenshot({ path: path.join(__dirname, '..', 'test-results', 'classic-gallery.png') });
    await page.evaluate(() => {
      gameMode = 'survival'; resetVitals(); vitals.health = 17; vitals.hunger = 13;
      player.p = [0.5, 11.01, 4.5]; player.yaw = 0; player.pitch = -0.04; mobs.length = 0;
      world.setBlock(0, 11, 1, B.STONE); world.setBlock(0, 12, 1, B.STONE); remeshAt(0, 1);
      sel = 1; bag[I.DIAMOND_PICK] = 1; target = world.raycast(...eyePos(), ...lookDir(), 5); mobTarget = null;
      mouseL = true; mining.key = [target.x, target.y, target.z, target.id, hotbar[sel]].join(','); mining.stage = 6;
      particles.length = 0; spawnBlockChips(target, 5); swing = 0;
      $('heldName').style.opacity = 0; $('toast').style.opacity = 0; hudStamp = ''; updateHUD(); refreshHotbar(); drawWorld(0);
    });
    await page.screenshot({ path: path.join(__dirname, '..', 'test-results', 'survival-mining.png') });
    await page.evaluate(() => {
      gameMode = 'creative'; resetMining(); mobs.length = particles.length = 0;
      player.p = [0.5, 11.01, 8.5]; player.yaw = 0; player.pitch = 0.04; player.eyeWater = false;
      for (let y = 11; y <= 16; y++) for (let z = -2; z <= 2; z++) for (let x = -3; x <= 3; x++) world.setBlock(x, y, z, B.STONE);
      explodeArrow(0, 13, 0);
      for (const c of world.chunks.values()) if (world.canMesh(c)) uploadChunk(c, world.meshChunk(c));
      hotbar[0] = I.BOW; hotbar[1] = I.EXPLOSIVE_ARROW; hotbar[2] = I.GUNPOWDER; sel = 0; selectedArrow = I.EXPLOSIVE_ARROW;
      $('toast').style.opacity = $('heldName').style.opacity = 0;
      updateHUD(); refreshHotbar(); drawWorld(0);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('explosion WebGL error');
    });
    await page.screenshot({ path: path.join(__dirname, '..', 'test-results', 'explosive-arrow.png') });
    // Visual poses use the deterministic page, so browser pause events cannot cover the scene.
    await page.evaluate(() => {
      world = new World(2048); mobs.length = projectiles.length = particles.length = 0; hotbar[sel] = I.IRON_SWORD;
      player.p = [0.5, 11.01, 4.5]; player.yaw = 0; player.pitch = -0.12;
      for (let cz = -2; cz <= 2; cz++) for (let cx = -2; cx <= 2; cx++) {
        const c = new Chunk(cx, cz); c.gen = true; c.maxY = 10; c.hm.fill(10);
        c.blocks.fill(B.GRASS, 10 * 256, 11 * 256); world.chunks.set(world.key(cx, cz), c);
      }
      for (const c of world.chunks.values()) if (world.canMesh(c)) uploadChunk(c, world.meshChunk(c));
      for (const [type, x] of [['pig', -2], ['cow', 0.5], ['sheep', 3]]) {
        const m = spawnMob(type, x, 11.01, 0); m.yaw = 0;
        damageMob(m, 100); for (let n = 0; n < 13; n++) updateMobDeath(m, 0.05);
      }
      $('menu').style.display = 'none'; $('heldName').style.opacity = $('toast').style.opacity = 0;
      updateSky(); updateHUD(); drawWorld(0);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('death pose WebGL error');
    });
    await page.screenshot({ path: path.join(__dirname, '..', 'test-results', 'animal-death.png') });
    results.push(...await require('./bow-pose.cjs')(page));
    results.push(...await require('./world-jobs.cjs')(page));
    const worldResults = await require('./world-scenarios.cjs')(page);
    results.push(...worldResults);
    for (const r of worldResults) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.error ? ': ' + r.error : ''}`);
    await page.screenshot({ path: path.join(__dirname, '..', 'test-results', 'nether.png') });
    results.push(...await require('./lighting.cjs')(page));
    // A separate page exercises actual animation frames and keyboard/mouse input.
    const live = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    live.on('pageerror', e => { errors.push(e.message); console.error('Live browser error:', e.message); });
    await live.goto(`http://127.0.0.1:${server.address().port}`);
    await live.locator('#settingsButton').click(); await live.locator('#seed').fill('12345'); await live.locator('#rd').fill('3'); await live.locator('#closeSettings').click(); await live.locator('#play').click();
    await live.waitForFunction(() => started && document.pointerLockElement === canvas && fpsN > 2);
    results.push(...await require('./mouse-look.cjs')(live));
    // Exercise actual keyboard events: the former descent path ignored right Shift.
    for (const shift of ['ShiftLeft', 'ShiftRight']) {
      await live.evaluate(() => { gameMode = 'creative'; player.fly = true; player.onGround = false; player.p = [0.5, 110, 0.5]; player.v = [0, 0, 0]; });
      await live.keyboard.down(shift);
      await live.waitForFunction(() => player.fly && player.p[1] < 108.5, null, { timeout: 5000 });
      await live.keyboard.up(shift);
    }
    await live.evaluate(() => { player.p[1] = 110; player.v = [0, 0, 0]; });
    await live.keyboard.down('Space');
    await live.waitForFunction(() => player.fly && player.p[1] > 111.5, null, { timeout: 5000 });
    await live.keyboard.up('Space');
    await live.waitForFunction(() => player.fly && Math.abs(player.v[1]) < 0.02);
    await live.evaluate(() => { player.v[1] = 0; });
    await live.keyboard.down('ShiftLeft'); await live.keyboard.down('Space');
    const hover = await live.evaluate(() => { player.v[1] = 0; return { y: player.p[1], time: gameTime }; });
    await live.waitForFunction(time => gameTime > time + 0.3, hover.time);
    assert(Math.abs(await live.evaluate(() => player.p[1]) - hover.y) < 0.12, 'simultaneous ascent and descent cancel');
    await live.keyboard.up('Space'); await live.keyboard.up('ShiftLeft');
    await live.evaluate(() => { player.p = [0.5, world.surfaceY(0, 0) + 1.3, 0.5]; player.v = [0, 0, 0]; player.fly = true; });
    await live.keyboard.down('ShiftRight');
    await live.waitForFunction(() => !player.fly && player.onGround, null, { timeout: 5000 });
    await live.keyboard.up('ShiftRight');
    results.push({ name: 'real flight controls ascend, descend with either Shift, hover and cancel simultaneous inputs', pass: true });
    console.log('PASS real flight controls ascend, descend with either Shift, hover and cancel simultaneous inputs');
    await live.keyboard.press('KeyE');
    await live.waitForFunction(() => invOpen && document.pointerLockElement !== canvas);
    const pausedClock = await live.evaluate(() => gameTime);
    await live.locator('#invSearch').fill('石');
    await live.locator('#invSearch').pressSequentially('e1');
    assert.equal(await live.evaluate(() => gameTime), pausedClock, 'backpack freezes real animation loop');
    assert(await live.evaluate(() => invOpen), 'live typing E remains in search');
    await live.locator('#closeInv').click();
    await live.waitForFunction(() => !invOpen && document.pointerLockElement === canvas);
    await live.keyboard.press('Escape');
    await live.waitForFunction(() => document.pointerLockElement !== canvas);
    await live.locator('#menu').waitFor({ state: 'visible' });
    const pauseMenu = await live.locator('#menu').isVisible(); assert(pauseMenu, 'escape opens pause menu');
    results.push(...await require('./creature-weapons.cjs')(live));
    await live.close();
    const offline = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    offline.on('pageerror', e => errors.push(e.message));
    await offline.goto(require('node:url').pathToFileURL(path.join(__dirname, '..', 'index.html')).href);
    await offline.locator('#mode').selectOption('creative'); await offline.locator('#settingsButton').click(); await offline.locator('#seed').fill('12345'); await offline.locator('#rd').fill('3'); await offline.locator('#closeSettings').click();
    await offline.locator('#play').click();
    await offline.waitForFunction(() => started && gameMode === 'creative' && mobTexturesReady && fpsN > 2);
    await offline.waitForFunction(() => worldJobs.serial >= 2 && !worldJobs.disabled);
    assert(await offline.evaluate(() => Object.keys(textureImages).length === Object.keys(CLASSIC_TEXTURES).length && gl.getError() === gl.NO_ERROR), 'file URL loads all embedded classic textures');
    await offline.close();
    results.push(...await require('./mobile.cjs')(browser, `http://127.0.0.1:${server.address().port}`));
    assert.equal(errors.length, 0, errors.join('\n'));
    assert(results.every(r => r.pass), `${results.filter(r => !r.pass).length} gameplay checks failed`);
    console.log(`${results.length} gameplay scenarios passed; live controls, offline file URL, WebGL, UI search and runtime error checks passed.`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
