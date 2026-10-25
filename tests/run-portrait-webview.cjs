const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../server.cjs');
(async()=>{
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:process.env.TEST_BROWSER,headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    Object.defineProperty(Element.prototype,'requestFullscreen',{value:()=>Promise.reject(new Error('webview refuses fullscreen'))});
    if (screen.orientation) Object.defineProperty(screen.orientation,'lock',{value:()=>Promise.reject(new Error('webview refuses rotation'))});
  });
  const centre=async selector=>{const r=await page.locator(selector).boundingBox();return [r.x+r.width/2,r.y+r.height/2,1];};
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    assert(await page.evaluate(()=>isTouchMode()&&isPortraitTouch()&&canvas.clientWidth===844&&canvas.clientHeight===390));
    assert(await page.locator('#rotateHint').count()===0,'rotation cannot block entry');
    await page.locator('#play').tap();await page.waitForFunction(()=>started&&hasGameFocus()&&!$('touchControls').hidden);
    console.log('PASS portrait-only webview enters a landscape game even when fullscreen and orientation lock are denied');
    const cdp=await context.newCDPSession(page);
    const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id=1])=>({x,y,id}))});
    const forward=await centre('#touchForward'), initial=await page.evaluate(()=>({yaw:player.yaw,pitch:player.pitch}));
    await touch('touchStart',[forward,[230,420,2]]);
    await touch('touchMove',[forward,[220,470,2]]);
    await page.waitForFunction(initial=>touchMove.z===1&&player.yaw<initial.yaw-0.15&&player.pitch<initial.pitch-0.02,initial);
    await touch('touchEnd',[]);await page.waitForFunction(()=>!touchMove.z&&!lookPointer);
    console.log('PASS native touch movement and look use the rotated landscape axes');
    await page.locator('#touchBag').tap();await page.waitForFunction(()=>invOpen);
    assert(await page.evaluate(()=>{const r=$('invbox').getBoundingClientRect();return r.x>=-1&&r.y>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;}),'rotated backpack fits the physical screen');
    await page.locator('#closeInv').tap();await page.waitForFunction(()=>hasGameFocus());
    await page.locator('#touchPause').tap();await page.locator('#settingsButton').tap();
    assert(await page.evaluate(()=>{const r=$('settingsDialog').getBoundingClientRect();return r.x>=-1&&r.y>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;}),'native dialog also rotates and fits');
    await page.locator('#sensitivity').fill('110');await page.locator('#closeSettings').tap();await page.locator('#play').tap();await page.waitForFunction(()=>hasGameFocus());
    await page.screenshot({path:path.join(__dirname,'..','test-results','portrait-webview-fixed.png')});
    console.log('PASS backpack, settings dialog and resume remain accessible in the rotated browser');
    await touch('touchStart',[await centre('#touchForward')]);await page.waitForFunction(()=>touchMove.z===1);
    await page.setViewportSize({width:844,height:390});
    await page.waitForFunction(()=>!isPortraitTouch()&&!touchMove.z&&canvas.clientWidth===844&&canvas.clientHeight===390);
    await touch('touchEnd',[]);
    assert(await page.evaluate(()=>hasGameFocus()&&!document.body.classList.contains('virtualLandscape')));
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('PASS physical rotation restores the normal landscape layout and clears held inputs');
  } finally {await context.close();await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
