const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),{createServer}=require('../server.cjs');
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.TEST_BROWSER,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const url=`http://127.0.0.1:${server.address().port}`;
 try {
  const page=await browser.newPage({viewport:{width:1100,height:760}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.addInitScript(()=>{requestAnimationFrame=()=>1;});await page.goto(url);
  await page.locator('#settingsButton').click();await page.locator('#rd').fill('3');await page.locator('#closeSettings').click();await page.locator('#play').click();
  await page.waitForFunction(()=>started&&!sessionBusy,null,{polling:25});
  const results=await page.evaluate(()=>{
   const results=[],assert=(v,m)=>{if(!v)throw Error(m);},test=(name,fn)=>{try{fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});}};
   window.bedArena=()=>{
    resetBedSleep();bedRespawn=null;worldJobs.cancel();world=new World(12345);mobs.length=particles.length=projectiles.length=0;
    for(let z=-2;z<=2;z++)for(let x=-2;x<=2;x++){const c=new Chunk(x,z);c.gen=true;c.maxY=10;c.hm.fill(10);c.blocks.fill(B.STONE,0,11*256);world.chunks.set(world.key(x,z),c);}
    gameMode='survival';$('mode').value=gameMode;hotbar.fill(0);hotbar[0]=I.BED;sel=0;
    for(const key of Object.keys(bag))delete bag[key];bag[I.BED]=3;
    player.p=[3.5,11.001,3.5];player.v=[0,0,0];player.fly=false;player.onGround=true;player.sneak=false;player.eyeH=1.62;player.yaw=player.pitch=0;
    resetVitals();spawnPoint=[10.5,11.001,10.5];gameTime=0;paused=false;resetDimensions();resetTouchInput();
    target={x:1,y:10,z:1,nx:0,ny:1,nz:0,id:B.STONE};
   };
   test('bed recipe needs a workbench, three wool and three planks',()=>{
    bedArena();bag[I.BED]=0;bag[B.WOOL]=3;bag[B.PLANKS]=3;const r=RECIPES.find(r=>r.out===I.BED);
    assert(r.bench&&!canCraft(r),'workbench is required');world.setBlock(5,11,5,B.WORKBENCH);craft(r);
    assert(countItem(I.BED)===1&&!countItem(B.WOOL)&&!countItem(B.PLANKS),'recipe consumes materials once');
    assert(I.BED>I.EXPLOSIVE_ARROW,'bed is appended without changing existing item IDs');
   });
   test('all four directions place two matching halves, spend one bed and prevent blocked or unsupported placement',()=>{
    for(let dir=0;dir<4;dir++){bedArena();player.yaw=-dir*Math.PI/2;placeBed();const [dx,dz]=BED_DIRS[dir];
     assert(world.getBlock(1,11,1)===B.BED+dir&&world.getBlock(1+dx,11,1+dz)===B.BED+4+dir&&countItem(I.BED)===2,'direction '+dir);
     assert(bedAt(world,1+dx,11,1+dz).x===1,'head resolves to the same foot');}
    bedArena();world.setBlock(1,11,0,B.STONE);placeBed();assert(!world.getBlock(1,11,1)&&countItem(I.BED)===3,'blocked head cannot partially place');
    world.setBlock(1,11,0,B.AIR);world.setBlock(1,10,0,B.AIR);placeBed();assert(!world.getBlock(1,11,1)&&countItem(I.BED)===3,'unsupported head cannot place');
   });
   test('breaking either half and removing support removes the pair and drops exactly one bed, including across chunks',()=>{
    bedArena();player.yaw=-Math.PI/2;target={x:15,y:10,z:1,nx:0,ny:1,nz:0,id:B.STONE};placeBed();
    assert(isBedBlock(world.getBlock(16,11,1)),'head crosses chunk edge');target={x:16,y:11,z:1,id:B.BED+5};breakBlock();
    assert(!world.getBlock(15,11,1)&&!world.getBlock(16,11,1)&&countItem(I.BED)===3,'head break drops one item');
    bedArena();placeBed();world.setBlock(1,10,0,B.AIR);world.physics.stepTick();
    assert(!world.getBlock(1,11,1)&&!world.getBlock(1,11,0)&&countItem(I.BED)===3,'loss of support drops one item');
   });
   test('bed height matches 9/16 blocks, rays pass above it, and walking steps onto the mattress',()=>{
    bedArena();placeBed();assert(collides(1.5,11.5,1.5)&&!collides(1.5,11.564,1.5),'partial height collision');
    assert(!world.raycast(1.5,11.8,3,0,0,-1,5),'ray passes over empty space above mattress');
    const hit=world.raycast(1.5,13,1.5,0,-1,0,4);assert(hit?.ny===1&&Math.abs(hit.t-1.4375)<1e-6,'ray hits actual mattress top');
    player.p=[1.5,11.001,2.25];player.v=[0,0,0];player.onGround=true;keys.KeyW=true;
    for(let n=0;n<8&&player.p[2]>1.9;n++)updatePlayer(.05);keys.KeyW=false;
    assert(player.p[2]<2&&player.p[1]>11.5,'player steps onto bed without a full-block jump');
   });
   test('day use sets spawn; monsters and blocked headroom prevent sleep; night sleep fades and advances only to morning',()=>{
    bedArena();placeBed();const hit={x:1,y:11,z:1,id:B.BED};useBed(hit);assert(bedRespawn?.x===1&&!sleeping.active&&gameTime===0,'day sets spawn without skipping time');
    gameTime=300;spawnMob('zombie',4,11,1);useBed(hit);assert(!sleeping.active,'nearby monsters block sleep');mobs.length=0;
    world.setBlock(1,12,0,B.STONE);useBed(hit);assert(!sleeping.active,'ceiling obstruction blocks sleep');world.setBlock(1,12,0,B.AIR);
    vitals.health=9;vitals.hunger=12;useBed(hit);assert(sleeping.active&&!$('sleepOverlay').hidden&&player.eyeH===.24,'lying viewpoint and sleep UI');
    for(let n=0;n<102&&sleeping.active;n++)updateBedSleep(.05);
    assert(!sleeping.active&&gameTime===DAY_LEN*.77&&vitals.health===9&&vitals.hunger===12&&!collides(...player.p),'sleep wakes safely at dawn without healing');
    gameTime=DAY_LEN*.7499;useBed(hit);for(let n=0;n<102&&sleeping.active;n++){gameTime+=.05;updateBedSleep(.05);}
    assert(gameTime<DAY_LEN&&gameTime>=DAY_LEN*.77,'sleep close to dawn does not skip an extra day');
   });
   test('leaving or breaking a bed cancels sleep; valid beds respawn safely and destroyed beds fall back to world spawn',()=>{
    bedArena();placeBed();const hit={x:1,y:11,z:1,id:B.BED};gameTime=300;useBed(hit);updateBedSleep(1);endBedSleep();
    assert(!sleeping.active&&gameTime===300&&bedRespawn,'leaving cancels the time skip but keeps respawn');
    useBed(hit);world.setBlock(1,11,0,B.AIR);updateBedSleep(.05);assert(!sleeping.active&&gameTime===300,'breaking a half interrupts sleep');
    bedArena();placeBed();useBed(hit);player.p=[10.5,20,10.5];respawnPlayer();
    assert(player.p[0]<3&&!collides(...player.p),'respawn uses a safe spot beside the bed');
    world.setBlock(1,11,1,B.AIR);player.p=[1.5,30,1.5];respawnPlayer();
    assert(!bedRespawn&&player.p[0]===spawnPoint[0]&&player.p[2]===spawnPoint[2],'destroyed bed falls back to initial world spawn');
   });
   test('using a Nether bed explodes without drops or a new respawn point',()=>{
    bedArena();world.dimension='nether';placeBed();player.p=[2.5,11.001,1.5];world.setBlock(2,11,0,B.OBSIDIAN);useBed({x:1,y:11,z:1,id:B.BED});
    assert(!bedRespawn&&!sleeping.active&&!world.getBlock(1,11,1)&&!world.getBlock(1,11,0)&&countItem(I.BED)===2,'bed is consumed by the explosion');
    assert(dead&&$('deathCause').textContent.startsWith('床爆炸')&&particles.length>=60&&world.getBlock(2,11,0)===B.OBSIDIAN,'explosion hurts, uses the correct cause and respects protected blocks');
   });
   bedArena();placeBed();world.setBlock(3,11,1,B.TORCH);world.lighting.prepare(world.getChunk(0,0));
   test('classic bed mesh has mattress, pillow, legs, pixel item art and receives light through its partial shape',()=>{
    const vertices=bedGeometry(B.BED).flat();assert(Math.max(...vertices.map(v=>v[1]))===9/16&&Math.min(...vertices.map(v=>v[1]))===0,'model dimensions');
    assert(bedGeometry(B.BED).length===17&&lightOpacity(B.BED)===1&&world.lighting.at(1,11,1)>0,'legs and transmitted light');
    const pixels=icon(I.BED).getContext('2d').getImageData(0,0,32,32).data;let red=0,white=0,clear=0;
    for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<10)clear++;else if(pixels[i]>100&&pixels[i]>pixels[i+1]*1.5)red++;else if(pixels[i]>180&&pixels[i+1]>180)white++;}
    assert(red>20&&white>5&&clear>100,'classic red bed and white pillow icon: '+[red,white,clear]);
   });
   useBed({x:1,y:11,z:1,id:B.BED});
   window.bedExpectedMesh=world.meshChunk(world.getChunk(0,0)).opaque;
   for(const c of world.chunks.values())if(world.canMesh(c))uploadChunk(c,world.meshChunk(c));
   player.p=[3.6,12.1,4.2];const d=[1.5-player.p[0],11.4-player.p[1]-player.eyeH,1-player.p[2]];player.yaw=Math.atan2(-d[0],-d[2]);player.pitch=Math.asin(d[1]/Math.hypot(...d));
   target=mobTarget=null;$('menu').style.display='none';hotbar[0]=I.BED;refreshHotbar();updateSky();updateHUD();drawWorld(0);
   assert(gl.getError()===gl.NO_ERROR,'bed WebGL rendering');return results;
  });
  for(const r of results)console.log(`${r.pass?'PASS':'FAIL'} ${r.name}${r.error?': '+r.error:''}`);
  await page.locator('#menu').evaluate(el=>{el.style.visibility='hidden';});
  await page.screenshot({path:path.join(__dirname,'..','test-results','classic-bed.png')});
  await page.locator('#menu').evaluate(el=>{el.style.visibility='';});
  assert(results.every(r=>r.pass),JSON.stringify(results.filter(r=>!r.pass)));
  await page.evaluate(()=>worldJobs.mesh(world,world.getChunk(0,0)));await page.waitForFunction(()=>!worldJobs.job,null,{polling:25});
  assert(await page.evaluate(()=>{const c=world.getChunk(0,0),data=new Float32Array(bedExpectedMesh.length);gl.bindBuffer(gl.ARRAY_BUFFER,c.mesh.o.vbo);gl.getBufferSubData(gl.ARRAY_BUFFER,0,data);return data.every((v,i)=>v===bedExpectedMesh[i])&&!worldJobs.disabled;}),'worker bed mesh matches main-thread geometry');
  console.log('PASS background worker renders the same two-part bed geometry');
  await page.evaluate(async()=>saveCurrentGame());await page.reload();await page.waitForFunction(()=>saveCatalog.length===1,null,{polling:25});await page.locator('#play').click();await page.waitForFunction(()=>started&&!sessionBusy,null,{polling:25});
  assert(await page.evaluate(()=>bedRespawn?.x===1&&bedAt(world,1,11,1)&&countItem(I.BED)===2),'bed and respawn point survive page reload');
  await page.evaluate(()=>{player.p=[10.5,30,10.5];respawnPlayer();});assert(await page.evaluate(()=>player.p[0]<3),'saved bed is used after reload');
  assert.equal(errors.length,0,errors.join('\n'));console.log('PASS saved bed geometry and respawn point reload without invalidating existing save format');await page.close();

  const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true}),phone=await context.newPage(),phoneErrors=[];
  phone.on('pageerror',e=>phoneErrors.push(e.message));await phone.addInitScript(()=>{Object.defineProperty(Element.prototype,'requestFullscreen',{value:()=>Promise.reject(new Error('embedded'))});});
  await phone.goto(url);await phone.locator('#mode').selectOption('creative');await phone.locator('#play').tap();await phone.waitForFunction(()=>hasGameFocus());
  await phone.evaluate(()=>{
   worldJobs.cancel();world=new World(12345);mobs.length=0;resetDimensions();
   for(let z=-1;z<=1;z++)for(let x=-1;x<=1;x++){const c=new Chunk(x,z);c.gen=true;c.maxY=10;c.hm.fill(10);c.blocks.fill(B.STONE,0,11*256);world.chunks.set(world.key(x,z),c);}
   world.setBlock(1,11,1,B.BED);world.setBlock(1,11,0,B.BED+4);player.p=[1.5,11.001,3.1];player.v=[0,0,0];player.fly=false;player.yaw=0;player.pitch=-.63;player.eyeH=1.62;hotbar.fill(0);refreshHotbar();gameTime=300;
  });
  await phone.waitForFunction(()=>isBedBlock(target?.id));await phone.locator('#touchUse').tap();await phone.waitForFunction(()=>sleeping.active&&$('touchControls').hidden);
  await phone.locator('#leaveBed').tap();await phone.waitForFunction(()=>!sleeping.active&&hasGameFocus());assert(await phone.evaluate(()=>gameTime<450),'leaving does not skip night');
  await phone.evaluate(()=>{player.p=[1.5,11.001,3.1];player.yaw=0;player.pitch=-.63;});await phone.waitForFunction(()=>isBedBlock(target?.id));await phone.locator('#touchUse').tap();
  await phone.waitForFunction(()=>!sleeping.active&&gameTime>=462,null,{timeout:15000});assert(await phone.evaluate(()=>hasGameFocus()&&!$('touchControls').hidden&&!document.body.classList.contains('sleeping')));
  assert.equal(phoneErrors.length,0,phoneErrors.join('\n'));console.log('PASS native phone use enters sleep, leave-bed cancels it, and full sleep wakes into playable morning controls');await context.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
