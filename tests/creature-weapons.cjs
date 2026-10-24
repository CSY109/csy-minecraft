const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async page => {
  const results = [];
  const passed = name => { results.push({ name, pass: true }); console.log('PASS ' + name); };
  await page.evaluate(() => {
    gameMode = 'survival'; $('mode').value = 'survival';
    bag[I.IRON_SWORD] = 1; bag[I.ARROW] = 6; hotbar[0] = I.IRON_SWORD;
    vitals.health = 13; vitals.hunger = 12; player.fly = false;
    world.generate(0, 0); world.setBlock(3, 85, 3, B.OBSIDIAN);
    window.modeCheckpoint = { world, position: player.p.slice(), bag: JSON.stringify(bag), bar: hotbar.slice(),
      mobs: mobs.slice(), time: gameTime, spawn: spawnPoint.slice() };
  });
  assert(await page.locator('#mode').isEnabled(), 'pause menu mode selector is enabled');
  await page.locator('#mode').selectOption('creative');
  assert(await page.evaluate(() => gameMode === 'creative' && $('vitals').hidden && hotbar.includes(I.BOW)), 'mode changes immediately and offers a bow');
  await page.evaluate(() => { hotbar[0] = B.DIAMOND_BLOCK; sel = 4; player.fly = true; mouseR = true; hotbar[sel] = I.BOW; beginBow(); });
  await page.locator('#mode').selectOption('survival');
  const retained = await page.evaluate(() => {
    const c = window.modeCheckpoint;
    return { mode: gameMode === 'survival', flight: !player.fly, bow: !bow.active, mouse: !mouseR, hud: !$('vitals').hidden,
      world: world === c.world, edit: world.getBlock(3, 85, 3) === B.OBSIDIAN, position: JSON.stringify(player.p) === JSON.stringify(c.position),
      bag: JSON.stringify(bag) === c.bag, bar: JSON.stringify(hotbar) === JSON.stringify(c.bar),
      health: vitals.health === 13, hunger: vitals.hunger === 12, time: gameTime === c.time,
      mobs: mobs.length === c.mobs.length && mobs.every((m, n) => m === c.mobs[n]), spawn: JSON.stringify(spawnPoint) === JSON.stringify(c.spawn) };
  });
  assert(Object.values(retained).every(Boolean), 'switching keeps game state: ' + JSON.stringify(retained));
  await page.locator('#mode').selectOption('creative');
  assert(await page.evaluate(() => hotbar[0] === B.DIAMOND_BLOCK), 'creative bar restored');
  await page.locator('#mode').selectOption('survival');
  passed('pause menu switches modes repeatedly without reloading or resetting game state');

  await page.locator('#play').click();
  await page.waitForFunction(() => document.pointerLockElement === canvas);
  const prepareBow = async () => page.evaluate(() => {
    mobs.length = projectiles.length = particles.length = 0; cancelBow();
    player.p = [0.5, 90, 0.5]; player.v = [0, 0, 0]; player.yaw = 0; player.pitch = 0;
    player.fly = false; bag[I.BOW] = 1; bag[I.ARROW] = 6; hotbar[0] = I.BOW; hotbar[1] = I.IRON_SWORD; sel = 0;
    // A stable platform prevents falling from changing the aim during real input tests.
    world.generate(0, 0); world.setBlock(0, 89, 0, B.STONE); world.setBlock(0, 90, 0, B.AIR); world.setBlock(0, 91, 0, B.AIR);
    vitals.fallTop = 90; refreshHotbar();
  });
  await prepareBow();
  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => bow.active && bow.elapsed === 1);
  assert(await page.evaluate(() => countItem(I.ARROW) === 6 && !projectiles.length && handId === I.BOW + ':' + BOW_PULL_TILES[2]), 'holding fully draws classic bow without auto firing');
  await page.screenshot({ path: path.join(__dirname, '..', 'test-results', 'bow-drawn.png') });
  await page.mouse.up({ button: 'right' });
  assert(await page.evaluate(() => !bow.active && bow.recoil > 0 && swing === 0 && countItem(I.ARROW) === 5 && projectiles.length === 1 && projectiles[0].damage === 7 && projectiles[0].v[2] === -30), 'release fires once, spends one arrow and starts bow recoil without a sword swing');
  await page.waitForFunction(() => bow.raise === 0 && bow.recoil === 0);
  await prepareBow();
  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => bow.elapsed >= 0.3);
  await page.mouse.up({ button: 'right' });
  assert(await page.evaluate(() => countItem(I.ARROW) === 5 && projectiles.length === 1 && projectiles[0].damage < 7 && Math.abs(projectiles[0].v[2]) < 30), 'partial draw has less speed and damage');
  await prepareBow();
  await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
  assert(await page.evaluate(() => countItem(I.ARROW) === 6 && !projectiles.length), 'quick tap does not waste ammo');
  passed('real right mouse input charges, draws classic sprites and fires arrows with variable power');

  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => bow.elapsed >= 0.2);
  await page.keyboard.press('Digit2'); await page.mouse.up({ button: 'right' });
  assert(await page.evaluate(() => !bow.active && !projectiles.length && countItem(I.ARROW) === 6), 'switch item cancels firing');
  await prepareBow(); await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => bow.elapsed >= 0.2);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => invOpen && !document.pointerLockElement);
  await page.mouse.up({ button: 'right' });
  assert(await page.evaluate(() => !bow.active && !projectiles.length && countItem(I.ARROW) === 6), 'backpack cancels firing');
  await page.locator('#closeInv').click(); await page.waitForFunction(() => document.pointerLockElement === canvas);
  await prepareBow(); await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => bow.elapsed >= 0.2);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.pointerLockElement && !bow.active);
  await page.mouse.up({ button: 'right' });
  assert(await page.evaluate(() => !projectiles.length && countItem(I.ARROW) === 6), 'pause cancels firing');
  await page.locator('#mode').selectOption('creative');
  await page.locator('#play').click(); await page.waitForFunction(() => document.pointerLockElement === canvas);
  await prepareBow(); await page.evaluate(() => { bag[I.ARROW] = 0; });
  await page.mouse.down({ button: 'right' });
  try { await page.waitForFunction(() => bow.elapsed === 1, null, {timeout:5000}); }
  catch(error) { console.error('BOW STATE', await page.evaluate(()=>({bow,mouseR,paused,invOpen,dead,mode:gameMode,lock:document.pointerLockElement?.id,focus:hasGameFocus(),selected:hotbar[sel],device:deviceMode,hidden:document.hidden})));throw error; }
  await page.mouse.up({ button: 'right' });
  assert(await page.evaluate(() => projectiles.length === 1 && countItem(I.ARROW) === 0), 'creative shoots without ammo');
  passed('slot changes, backpack and pause cancel drawing without spending arrows; creative has unlimited arrows');
  await require('./explosive-arrows.cjs')(page, results);

  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.pointerLockElement);
  await page.locator('#menu').waitFor({ state: 'visible' });
  return results;
};
