const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
  const url=process.env.PLAY_URL||'https://csy109.github.io/csy-minecraft/';
  const browser=await chromium.launch({executablePath:process.env.TEST_BROWSER,headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],failed=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push([r.url(),r.status()]);});
    const response=await page.goto(url);assert.equal(response.status(),200);
    assert.equal(await page.title(),"csy's Minecraft");
    assert(await page.locator('#desktopMode,#mobileMode').count()===0);
    assert(await page.evaluate(()=>!isTouchMode()&&parseFloat(getComputedStyle(document.querySelector('.brand small')).fontSize)<document.querySelector('.brand img').clientHeight/3));
    await page.screenshot({path:path.join(__dirname,'..','test-results','published-desktop.png')});
    await page.locator('#mode').selectOption('creative');await page.locator('#settingsButton').click();await page.locator('#seed').fill('12345');await page.locator('#rd').fill('3');await page.locator('#closeSettings').click();await page.locator('#play').click();
    await page.waitForFunction(()=>started&&hasGameFocus()&&document.pointerLockElement===canvas&&worldJobs.serial>=2&&!worldJobs.disabled);
    assert(await page.evaluate(()=>gl.getError()===gl.NO_ERROR&&Object.keys(textureImages).length===Object.keys(CLASSIC_TEXTURES).length));
    await page.keyboard.press('KeyE');await page.waitForFunction(()=>invOpen);
    await page.locator('#invSearch').fill('火把');await page.getByRole('button',{name:'火把',exact:true}).click();
    assert(await page.evaluate(()=>hotbar[sel]===B.TORCH));
    await page.locator('#closeInv').click();await page.waitForFunction(()=>hasGameFocus());
    await page.keyboard.press('Escape');await page.locator('#menu').waitFor({state:'visible'});
    await page.locator('#mode').selectOption('survival');assert(await page.evaluate(()=>gameMode==='survival'&&!player.fly));
    assert.equal(errors.length,0,errors.join('\n'));assert.equal(failed.length,0,JSON.stringify(failed));
    await page.close();console.log('PASS public desktop URL, assets, mouse lock, background worker, torch inventory and live mode switching');
    await require('./mobile.cjs')(browser,url);
    console.log('PASS published game verified on desktop and native multi-touch phone emulation: '+url);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
