const assert = require('node:assert/strict');

module.exports = async (page, results) => {
  const passed = name => { results.push({ name, pass: true }); console.log('PASS ' + name); };
  await page.evaluate(() => { projectiles.length = 0; bag[I.EXPLOSIVE_ARROW] = 0; selectedArrow = I.ARROW; });
  await page.keyboard.press('KeyR');
  assert(await page.evaluate(() => selectedArrow === I.EXPLOSIVE_ARROW && $('heldName').textContent.includes('爆炸箭')), 'R selects and briefly names explosive ammo');
  await page.mouse.down({ button: 'right' }); await page.waitForFunction(() => bow.elapsed >= 0.3); await page.mouse.up({ button: 'right' });
  assert(await page.evaluate(() => projectiles.length === 1 && projectiles[0].type === 'explosive_arrow' && projectiles[0].damage === 20 && !countItem(I.EXPLOSIVE_ARROW)), 'creative bow fires explosive ammo for free');
  await page.evaluate(() => { projectiles.length = 0; });
  await page.mouse.down({ button: 'right' }); await page.waitForFunction(() => bow.elapsed >= 0.2);
  await page.keyboard.press('KeyR'); await page.mouse.up({ button: 'right' });
  assert(await page.evaluate(() => selectedArrow === I.ARROW && !bow.active && !projectiles.length), 'changing ammo cancels an active draw');
  await page.keyboard.press('KeyE'); await page.waitForFunction(() => invOpen && !document.pointerLockElement);
  await page.locator('#invSearch').fill('爆炸箭');
  await page.getByRole('button', { name: '爆炸箭', exact: true }).click();
  assert(await page.evaluate(() => hotbar[sel] === I.BOW && selectedArrow === I.EXPLOSIVE_ARROW), 'inventory picks ammo while keeping bow equipped');
  await page.locator('#closeInv').click(); await page.waitForFunction(() => document.pointerLockElement === canvas);
  passed('R and inventory select explosive ammo; creative fires it; changing ammo cancels drawing');

  await page.keyboard.press('Escape'); await page.locator('#menu').waitFor({ state: 'visible' });
  await page.locator('#mode').selectOption('survival');
  await page.evaluate(() => {
    projectiles.length = mobs.length = 0; selectedArrow = I.EXPLOSIVE_ARROW;
    bag[I.BOW] = 1; bag[I.ARROW] = 3; bag[I.EXPLOSIVE_ARROW] = 2; hotbar[0] = I.BOW; sel = 0;
    player.p = [0.5, 90, 0.5]; player.v = [0, 0, 0]; vitals.fallTop = 90; refreshHotbar();
  });
  await page.locator('#play').click(); await page.waitForFunction(() => document.pointerLockElement === canvas);
  await page.mouse.down({ button: 'right' }); await page.waitForFunction(() => bow.elapsed >= 0.3);
  assert(await page.evaluate(() => countItem(I.EXPLOSIVE_ARROW) === 2), 'draw does not spend explosives');
  await page.mouse.up({ button: 'right' });
  assert(await page.evaluate(() => countItem(I.EXPLOSIVE_ARROW) === 1 && countItem(I.ARROW) === 3 && projectiles[0]?.type === 'explosive_arrow' && projectiles[0].damage === 20), 'only selected explosive ammo spent; partial draw still deals 20');
  await page.evaluate(() => { projectiles.length = 0; bag[I.EXPLOSIVE_ARROW] = 0; });
  await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
  assert(await page.evaluate(() => !bow.active && !projectiles.length && countItem(I.ARROW) === 3), 'empty explosives cannot spend regular arrows or create a free blast');
  await page.keyboard.press('KeyR');
  await page.mouse.down({ button: 'right' }); await page.waitForFunction(() => bow.elapsed >= 0.3); await page.mouse.up({ button: 'right' });
  assert(await page.evaluate(() => countItem(I.ARROW) === 2 && projectiles[0]?.type === 'arrow'), 'switching back retains ordinary arrow behavior');
  passed('survival spends only the selected arrow type and never grants free explosive shots');
  await page.keyboard.press('Escape'); await page.locator('#menu').waitFor({ state: 'visible' });
  await page.locator('#mode').selectOption('creative');
  await page.locator('#play').click(); await page.waitForFunction(() => document.pointerLockElement === canvas);
};
