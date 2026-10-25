const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../server.cjs');
(async()=>{
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:process.env.TEST_BROWSER,headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:3});
  const page=await context.newPage(), errors=[], requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.addInitScript(()=>{
    Object.defineProperty(Element.prototype,'requestFullscreen',{value:()=>Promise.reject(new Error('embedded browser'))});
    if(screen.orientation)Object.defineProperty(screen.orientation,'lock',{value:()=>Promise.reject(new Error('embedded browser'))});
  });
  const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id=1])=>({x,y,id}))});
  const centre=async selector=>{const r=await page.locator(selector).boundingBox();return [r.x+r.width/2,r.y+r.height/2,1];};
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    assert(!requests.some(url=>url.includes('classic-sounds.js')||url.includes('panorama.png')),'large audio pack and PNG must not block the menu');
    assert(requests.some(url=>url.includes('panorama.webp')),'cover uses compressed WebP');
    await page.locator('#mode').selectOption('creative');await page.locator('#settingsButton').tap();await page.locator('#seed').fill('12345');await page.locator('#closeSettings').tap();
    await page.evaluate(()=>{
      window.mainTerrainCalls=0;
      World.prototype.generate=World.prototype.meshChunk=function(){window.mainTerrainCalls++;throw new Error('Terrain ran on UI thread');};
      $('play').addEventListener('pointerup',()=>window.bootBegin=performance.now(),{capture:true});
    });
    await page.locator('#play').tap();await page.waitForFunction(()=>started&&hasGameFocus()&&fpsN>=1);
    const startup=await page.evaluate(()=>({elapsed:performance.now()-bootBegin,...startupStats,mainTerrainCalls,chunks:startupStats.chunks,
      hasFloor:!!SOLID[world.getBlock(Math.floor(player.p[0]),Math.floor(player.p[1])-1,Math.floor(player.p[2]))],
      readyMesh:!!world.getChunk(Math.floor(player.p[0])>>4,Math.floor(player.p[2])>>4).mesh,inventoryBuilt:!!$('invgrid').children.length,
      width:canvas.width,height:canvas.height,antialias:gl.getContextAttributes().antialias}));
    if (!process.env.TEST_FLIGHT_TAIL) {
    assert(startup.background&&startup.chunks===9&&startup.mainTerrainCalls===0&&startup.hasFloor&&startup.readyMesh,'first playable world is safe and built entirely off the UI thread');
    assert(!startup.inventoryBuilt&&startup.width===844&&startup.height===390&&!startup.antialias,'defer unused inventory and reduce mobile GPU work');
    console.log('PASS accelerated startup with 4× CPU throttling: '+JSON.stringify(startup));
    await page.waitForFunction(()=>[...world.chunks.values()].filter(c=>c.mesh).length>=9);
    assert(await page.evaluate(()=>!worldJobs.disabled&&!mainTerrainCalls),'nearby world fills progressively in the worker');
    await page.waitForFunction(()=>Object.keys(decodedSounds).length>=46,null,{timeout:20000});
    assert(requests.some(url=>url.includes('classic-sounds.js')),'sounds still load after entry');
    console.log('PASS background streaming fills nearby chunks and delayed classic audio remains available');

    await page.evaluate(()=>{player.p[1]=CH+12;player.v=[0,0,0];player.fly=false;player.onGround=false;});
    const jump=await centre('#touchJump');await touch('touchStart',[jump]);await page.waitForFunction(()=>touchJumpTime>0.05);await touch('touchEnd',[]);
    assert(await page.evaluate(()=>!player.fly),'short press is a jump rather than a flight toggle');
    await touch('touchStart',[await centre('#touchJump')]);await page.waitForFunction(()=>player.fly&&!$('touchDescend').hidden);
    const y=await page.evaluate(()=>player.p[1]);await page.waitForFunction(y=>player.p[1]>y+0.6,y);
    await touch('touchEnd',[]);await page.waitForFunction(()=>!keys.Space&&!touchJumpHeld&&Math.abs(player.v[1])<0.1);
    assert(await page.getByRole('button',{name:'上升',exact:true}).count()===1&&await page.getByRole('button',{name:'下降',exact:true}).count()===2,'ascending and descending labels are available');
    const down=await centre('#touchDescend'),forward=await centre('#touchForward');forward[2]=2;
    const before=await page.evaluate(()=>({p:player.p.slice(),yaw:player.yaw}));
    await touch('touchStart',[down,forward,[450,140,3]]);await touch('touchMove',[down,forward,[490,145,3]]);
    await page.waitForFunction(before=>player.p[1]<before.p[1]-0.6&&Math.hypot(player.p[0]-before.p[0],player.p[2]-before.p[2])>0.2&&player.yaw<before.yaw-0.1,before);
    await touch('touchEnd',[]);await page.waitForFunction(()=>!touchFlightDown&&!touchMove.z&&Math.abs(player.v[1])<0.1);
    await page.screenshot({path:path.join(__dirname,'..','test-results','mobile-flight-controls.png')});
    console.log('PASS short jump, long-press takeoff, ascent, descent with simultaneous movement/look, and hover');
    } else await page.evaluate(()=>{player.fly=true;player.p[1]+=5;player.v=[0,0,0];updateTouchUI();});
    await page.evaluate(()=>{const [x,,z]=player.p;player.p[1]=world.surfaceY(Math.floor(x),Math.floor(z))+2.2;player.v=[0,0,0];});
    await touch('touchStart',[await centre('#touchDescend')]);await page.waitForFunction(()=>!player.fly&&player.onGround&&$('touchDescend').hidden);await touch('touchEnd',[]);
    await page.locator('#touchPause').tap();await page.locator('#mode').selectOption('survival');await page.locator('#play').tap();await page.waitForFunction(()=>hasGameFocus());
    await touch('touchStart',[await centre('#touchJump')]);await page.waitForFunction(()=>touchJumpHeld);await page.waitForTimeout(650);
    assert(await page.evaluate(()=>!player.fly&&$('touchDescend').hidden),'survival holding jump never enables flying');
    await touch('touchEnd',[]);
    await page.locator('#touchPause').tap();await page.locator('#mode').selectOption('creative');await page.locator('#play').tap();await page.waitForFunction(()=>hasGameFocus());
    const holding=await centre('#touchJump');await touch('touchStart',[holding]);await page.waitForFunction(()=>touchJumpHeld);
    // Chrome's raw touch protocol can only end the entire contact set reliably.
    // Keep the native jump contact down while invoking the same pause action.
    await page.evaluate(()=>pauseGame());await page.waitForFunction(()=>paused);
    await touch('touchEnd',[]);await page.waitForTimeout(600);
    assert(await page.evaluate(()=>!player.fly&&!touchJumpHeld&&!touchFlightDown&&!keys.Space),'pause cancels pending long-press takeoff');
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('PASS landing exits flight, survival stays grounded, and pause cancels a pending long press');
  } finally {await context.close();await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
