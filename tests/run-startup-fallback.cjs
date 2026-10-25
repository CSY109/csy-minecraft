const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.TEST_BROWSER,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    const page=await browser.newPage(), errors=[];
    page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
    await page.addInitScript(()=>{window.Worker=undefined;requestAnimationFrame=()=>1;});
    await page.goto(pathToFileURL(path.join(__dirname,'..','index.html')).href);
    await page.locator('#play').click();
    try {await page.waitForFunction(()=>started&&startupStats,null,{timeout:10000,polling:50});}
    catch(error) {console.error(await page.evaluate(()=>({started,disabled:worldJobs.disabled,failure:worldJobs.failure,chunks:world?.chunks.size,loading:$('loading').style.display})));throw error;}
    assert(await page.evaluate(()=>!startupStats.background&&startupStats.chunks===9&&worldJobs.disabled&&!!world.getChunk(Math.floor(player.p[0])>>4,Math.floor(player.p[2])>>4).mesh));
    await page.waitForFunction(()=>Object.keys(decodedSounds).length>=46,null,{polling:50});
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('PASS desktop/offline startup without Worker yields between chunks and loads delayed sounds from local files');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
