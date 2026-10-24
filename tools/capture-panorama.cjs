const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../server.cjs');
const path = require('node:path');
(async () => {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.TEST_BROWSER, headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
    page.on('pageerror', error => console.error(error));
    await page.addInitScript(() => { requestAnimationFrame = () => 1; });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('#mode').selectOption('creative'); await page.locator('#settingsButton').click();
    await page.locator('#seed').fill('7331'); await page.locator('#rd').fill('3'); await page.locator('#closeSettings').click(); await page.locator('#play').click();
    await page.waitForFunction(() => started, null, { polling: 100 });
    const location = await page.evaluate(() => {
      world = new World(7331); mobs.length = particles.length = projectiles.length = 0; cancelBow(); hotbar.fill(0);
      let best = null;
      for (let z = -256; z <= 256; z += 32) for (let x = -256; x <= 256; x += 32) {
        const heights = [[0,0],[-40,0],[40,0],[0,-40],[0,40]].map(([dx,dz]) => world.terrainAt(x+dx,z+dz)[0]);
        const score = Math.max(...heights) - Math.min(...heights) + (world.terrainAt(x,z)[1] === BIOME.FOREST ? 20 : 0);
        if (!best || score > best.score) best = { x, z, score };
      }
      const x = best.x + 42, z = best.z + 48, cx = x >> 4, cz = z >> 4;
      for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) world.generate(cx + dx, cz + dz);
      player.p = [x, world.surfaceY(x,z)+19, z]; player.eyeH = 1.62; player.fovMul = 1;
      const target = [best.x, world.surfaceY(best.x,best.z)+2, best.z], eye = eyePos(), delta = target.map((v,i) => v-eye[i]);
      player.yaw = Math.atan2(-delta[0],-delta[2]); player.pitch = Math.asin(delta[1]/Math.hypot(...delta));
      renderDist = 8; gameTime = 0; updateSky();
      for (const c of world.chunks.values()) if (world.canMesh(c)) uploadChunk(c, world.meshChunk(c));
      for (const e of document.querySelectorAll('body > div')) e.style.display = 'none';
      drawWorld(0); return best;
    });
    console.log(location); await page.locator('#c').screenshot({ path: path.join(__dirname, '..', 'assets', 'panorama.png') });
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
