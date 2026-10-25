const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../server.cjs');
(async()=>{
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:process.env.TEST_BROWSER,headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const url=`http://127.0.0.1:${server.address().port}`;
  try {
    const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{window.requestAnimationFrame=()=>1;});
    await page.goto(url);await page.locator('#settingsButton').click();await page.locator('#seed').fill('12345');await page.locator('#rd').fill('3');
    await page.locator('#fov').fill('85');await page.locator('#sensitivity').fill('125');
    assert(await page.locator('#fovValue').textContent()==='85°');assert(await page.locator('#sensitivityValue').textContent()==='125%');
    await page.locator('#closeSettings').click();await page.locator('#play').click();await page.waitForFunction(()=>started);
    assert(await page.evaluate(()=>!isTouchMode()&&$('touchControls').hidden&&$('hotbar').querySelectorAll('[data-key]').length===9));
    await page.evaluate(()=>{mouseLookReady=true;const yaw=player.yaw;applyMouseLook({movementX:10,movementY:0});if(Math.abs(player.yaw-yaw+0.0275)>1e-8)throw Error('sensitivity not applied');});
    console.log('PASS desktop keyboard hotbar, mouse sensitivity and field-of-view settings');
    await require('./hazards.cjs')(page);await page.screenshot({path:path.join(__dirname,'..','test-results','burning-entities.png')});
    assert.equal(errors.length,0,errors.join('\n'));await page.close();
    await require('./mobile.cjs')(browser,url);
  } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
