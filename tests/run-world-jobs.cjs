const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../server.cjs');
(async () => {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.TEST_BROWSER, headless: true,
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage(); page.on('pageerror', error => console.error(error));
    if(!process.env.TEST_WEAPONS) await page.addInitScript(() => { requestAnimationFrame = () => 1; });
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.locator('#settingsButton').click(); await page.locator('#seed').fill('12345');
    await page.locator('#rd').fill('3'); await page.locator('#closeSettings').click(); await page.locator('#play').click(); await page.waitForFunction(() => started, null, { polling: 100 });
    if(process.env.TEST_WEAPONS){
      await page.waitForFunction(()=>document.pointerLockElement===canvas);await page.keyboard.press('Escape');
      await page.waitForFunction(()=>$('menu').style.display==='flex',null,{polling:100});await require('./creature-weapons.cjs')(page);
    }else await require('./world-jobs.cjs')(page);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
