const assert=require('node:assert/strict'),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),{createServer}=require('../server.cjs');
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.TEST_BROWSER,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try {
  const page=await browser.newPage({viewport:{width:1100,height:760}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('#mode').selectOption('creative');await page.locator('#settingsButton').click();await page.locator('#rd').fill('3');await page.locator('#closeSettings').click();await page.locator('#play').click();await page.waitForFunction(()=>hasGameFocus()&&!sessionBusy);
  await page.keyboard.press('Escape');await page.waitForFunction(()=>paused);
  await page.evaluate(()=>{bag[I.DIAMOND]=17;switchGameMode('survival');});
  assert(await page.evaluate(async()=>{await saveWrites;const r=await readGameSave(1);return r.bag[I.DIAMOND]===17&&r.mode==='survival';}));
  await page.locator('#play').click();await page.waitForFunction(()=>hasGameFocus());
  await page.evaluate(()=>{bag[I.DIAMOND]=19;});await page.keyboard.press('Escape');
  await page.waitForFunction(()=>paused);
  await page.reload();await page.waitForFunction(()=>saveCatalog.length===1);assert(await page.evaluate(()=>!gameGraphicsReady&&!mobTexturesReady),'fresh page has not initialised gameplay graphics');
  await page.locator('#play').click();await page.waitForFunction(()=>hasGameFocus()&&!sessionBusy&&gameGraphicsReady);
  const graphics=await page.evaluate(()=>({mobs:mobTexturesReady,sprites:getComputedStyle(document.documentElement).getPropertyValue('--hotbar-sprite').includes('data:image'),bag:countItem(I.DIAMOND),glError:gl.getError()}));
  assert(graphics.mobs&&graphics.sprites&&graphics.bag===19&&graphics.glError===0,JSON.stringify(graphics));
  console.log('PASS native Esc and mode changes save automatically; continuing after reload initialises classic textures, entity skins and the survival GUI');
  await page.evaluate(()=>pauseGame());
  await page.evaluate(async()=>{
    const n=new World(world.seed,'nether');for(let z=-1;z<=1;z++)for(let x=-1;x<=1;x++)n.generate(x,z);
    n.setBlock(8,50,8,B.DIAMOND_BLOCK);switchDimension(n);player.p=[8.5,55,8.5];player.fly=true;
    switchGameMode('creative');gameTime=234;await saveCurrentGame();
  });
  await page.reload();await page.waitForFunction(()=>saveCatalog.length===1);await page.locator('#play').click();await page.waitForFunction(()=>hasGameFocus()&&!sessionBusy);
  assert(await page.evaluate(()=>world.dimension==='nether'&&world.getBlock(8,50,8)===B.DIAMOND_BLOCK&&dimensionStates.has('overworld')&&Math.abs(player.p[0]-8.5)<.1&&gameTime>=234&&gameGraphicsReady&&gl.getError()===gl.NO_ERROR));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS saved Nether sessions reopen directly in the Nether with the overworld retained and valid WebGL rendering');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
