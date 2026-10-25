const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../server.cjs');
(async()=>{
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:process.env.TEST_BROWSER,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const url=`http://127.0.0.1:${server.address().port}`;
  try {
    if(!process.env.TEST_BOW_ONLY){
    const page=await browser.newPage({viewport:{width:1280,height:800}}), errors=[];
    page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
    await page.addInitScript(()=>{requestAnimationFrame=()=>1;});
    await page.goto(url);await page.locator('#mode').selectOption('creative');await page.locator('#settingsButton').click();await page.locator('#seed').fill('12345');await page.locator('#rd').fill('3');await page.locator('#closeSettings').click();
    await page.locator('#play').click();await page.waitForFunction(()=>started&&!sessionBusy&&activeSaveSlot===1,null,{polling:25});
    const expected=await page.evaluate(async()=>{
      const x=Math.floor(player.p[0])+2,z=Math.floor(player.p[2]);
      world.setBlock(x,85,z,B.DIAMOND_BLOCK);world.setBlock(x+1,84,z,B.WATER,3);
      world.physics.falling.push({x:x+2,y:86,z,id:B.SAND,vy:-1});world.physics.fireAges.set('2,3,4',5);
      const sheep=spawnMob('sheep',x+.5,player.p[1],z+.5);sheep.hp=7;sheep.burnTime=3.5;
      const nether=new World(world.seed,'nether');for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)nether.generate(dx,dz);
      nether.setBlock(8,45,8,B.GLOWSTONE);
      const portal=w=>{
        const p={x:4,y:75,z:4,axis:'x',width:2,height:3,world:w,invalid:false,link:null};
        for(let v=-1;v<=3;v++)for(let u=-1;u<=2;u++)w.setBlock(...portalCell(p,u,v),u===-1||u===2||v===-1||v===3?B.OBSIDIAN:B.AIR);
        return activatePortal(p);
      };
      const a=portal(world),b=portal(nether);a.link=b;b.link=a;
      const zombie=spawnMob('zombie',5.5,45,5.5);mobs.pop();zombie.hp=13;
      dimensionStates.set('nether',{world:nether,mobs:[zombie]});
      bag[I.DIAMOND]=12;bag[I.BOW]=1;bag[I.ARROW]=5;vitals.health=14;vitals.hunger=13.5;vitals.air=8;
      hotbar[0]=B.DIAMOND_BLOCK;modeHotbars.survival=[I.BOW,I.ARROW,0,0,0,0,0,0,I.APPLE];sel=2;selectedArrow=I.EXPLOSIVE_ARROW;
      player.yaw=.7;player.pitch=-.2;player.fly=true;player.v=[0,0,0];gameTime=123;
      await saveCurrentGame();return{x,z,seed:world.seed,sheep:sheep.id,spawn:spawnPoint.slice()};
    });
    await page.reload();await page.waitForFunction(()=>saveCatalog.length===1,null,{polling:25});
    await page.locator('#savesButton').click();assert.equal(await page.locator('.saveSlot').count(),3);
    await page.getByRole('combobox',{name:'存档 1 模式',exact:true}).selectOption('survival');await page.getByRole('button',{name:'进入存档 1',exact:true}).click();
    await page.waitForFunction(()=>started&&!sessionBusy&&gameMode==='survival',null,{polling:25});
    const restored=await page.evaluate(expected=>({
      terrain:world.getBlock(expected.x,85,expected.z)===B.DIAMOND_BLOCK,fluid:world.physics.level(expected.x+1,84,expected.z)===3,
      falling:world.physics.falling.length===1,fireAge:world.physics.fireAges.get('2,3,4')===5,
      stats:vitals.health===14&&vitals.hunger===13.5&&vitals.air===8&&gameTime===123,
      inventory:countItem(I.DIAMOND)===12&&countItem(I.ARROW)===5&&hotbar[0]===I.BOW&&selectedArrow===I.EXPLOSIVE_ARROW,
      mob:mobs.some(m=>m.id===expected.sheep&&m.hp===7&&m.burnTime===3.5),spawn:JSON.stringify(spawnPoint)===JSON.stringify(expected.spawn),
      nether:dimensionStates.get('nether').world.getBlock(8,45,8)===B.GLOWSTONE&&dimensionStates.get('nether').mobs[0].hp===13,
      links:world.portals[0].link===dimensionStates.get('nether').world.portals[0]&&world.portals[0].link.link===world.portals[0],
      mode:!player.fly&&gameMode==='survival',gpu:!!world.getChunk(Math.floor(player.p[0])>>4,Math.floor(player.p[2])>>4).mesh&&gl.getError()===gl.NO_ERROR
    }),expected);
    assert(Object.values(restored).every(Boolean),JSON.stringify(restored));
    console.log('PASS reload restores terrain, fluids, falling sand, inventory, vitals, mobs, both dimensions and linked portals in the selected mode');

    await page.evaluate(()=>pauseGame());await page.locator('#mode').selectOption('creative');
    assert(await page.evaluate(()=>hotbar[0]===B.DIAMOND_BLOCK&&countItem(I.DIAMOND)===12),'in-game mode switch preserves world and both hotbars');
    await page.locator('#savesButton').click();await page.getByRole('combobox',{name:'存档 2 模式',exact:true}).selectOption('creative');await page.getByRole('button',{name:'新建存档 2',exact:true}).click();
    await page.waitForFunction(()=>activeSaveSlot===2&&started&&!sessionBusy,null,{polling:25});
    assert(await page.evaluate(()=>countItem(I.DIAMOND)===0),'new world has a separate inventory');
    await page.evaluate(async()=>{bag[I.DIAMOND]=2;await saveCurrentGame();pauseGame();});
    await page.locator('#savesButton').click();await page.getByRole('button',{name:'新建存档 3',exact:true}).click();
    await page.waitForFunction(()=>activeSaveSlot===3&&started&&!sessionBusy,null,{polling:25});
    assert(await page.evaluate(()=>countItem(I.DIAMOND)===0),'third world also starts independently');
    await page.evaluate(async()=>{bag[I.DIAMOND]=3;await saveCurrentGame();});
    assert(await page.evaluate(async()=>{try{await createSaveSlot(4);return false;}catch{return true;}}),'fourth slot is rejected');
    await page.evaluate(()=>pauseGame());await page.locator('#savesButton').click();await page.screenshot({path:path.join(__dirname,'..','test-results','three-save-slots.png')});
    assert.equal(await page.locator('.saveSlot').count(),3);assert.equal(await page.locator('#saveSlots button').filter({hasText:'新建'}).count(),0);
    await page.getByRole('combobox',{name:'存档 1 模式',exact:true}).selectOption('survival');await page.getByRole('button',{name:'进入存档 1',exact:true}).click();
    await page.waitForFunction(()=>activeSaveSlot===1&&started&&!sessionBusy,null,{polling:25});
    assert(await page.evaluate(()=>countItem(I.DIAMOND)===12&&gameMode==='survival'),'returning to first slot preserves its independent state');
    console.log('PASS three independent worlds, per-slot and in-game mode selection, safe switching, and a strict three-slot limit');

    const failure=await page.evaluate(async()=>{
      const original=writeGameSave,oldWorld=world;writeGameSave=()=>Promise.reject(Object.assign(new Error('quota'),{name:'QuotaExceededError'}));
      try {await loadSaveSlot(3);return false;}catch{return world===oldWorld&&activeSaveSlot===1&&started&&!sessionBusy&&countItem(I.DIAMOND)===12;}
      finally{writeGameSave=original;}
    });assert(failure,'failed write cannot discard the currently open world');
    await page.evaluate(()=>pauseGame());await page.locator('#savesButton').click();
    assert(await page.getByRole('button',{name:'删除存档 1',exact:true}).isDisabled(),'active world cannot be deleted accidentally');
    await page.getByRole('button',{name:'删除存档 2',exact:true}).click();assert(await page.evaluate(async()=>!!await readGameSave(2)),'first deletion click only asks to confirm');
    await page.getByRole('button',{name:'确认删除存档 2',exact:true}).click();await page.waitForFunction(()=>saveCatalog.length===2,null,{polling:25});
    assert(await page.evaluate(async()=>!!await readGameSave(1)&&!await readGameSave(2)&&!!await readGameSave(3)),'deletion only removes the selected slot');
    await page.locator('#closeSaves').click();await page.locator('#saveExitButton').click();await page.waitForFunction(()=>!started&&!sessionBusy,null,{polling:25});
    assert(await page.evaluate(()=>!world&&!document.body.classList.contains('playing')&&saveCatalog.length===2),'save-and-exit returns to the cover');
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('PASS failed writes preserve the active world; deletion requires confirmation; save-and-exit preserves remaining worlds');
    await page.close();
    }

    for(const portrait of [false,true]) {
      const context=await browser.newContext({viewport:portrait?{width:390,height:844}:{width:844,height:390},isMobile:true,hasTouch:true});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>{Object.defineProperty(Element.prototype,'requestFullscreen',{value:()=>Promise.reject(new Error('embedded browser'))});});
      await page.goto(url);await page.locator('#mode').selectOption('creative');await page.locator('#play').tap();await page.waitForFunction(()=>hasGameFocus()&&!sessionBusy);
      await page.evaluate(()=>{hotbar[0]=I.BOW;sel=0;selectedArrow=I.ARROW;player.p[1]=CH+20;player.v=[0,0,0];player.fly=true;player.pitch=.3;projectiles.length=0;refreshHotbar();updateTouchUI();});
      const cdp=await context.newCDPSession(page),touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id=1])=>({x,y,id}))});
      const centre=async selector=>{const r=await page.locator(selector).boundingBox();return[r.x+r.width/2,r.y+r.height/2,1];};
      const use=await centre('#touchUse'),start=await page.evaluate(()=>({yaw:player.yaw,pitch:player.pitch,p:player.p.slice()}));
      await touch('touchStart',[use]);await page.waitForFunction(()=>bow.elapsed>.2);
      const drag=[use[0]+(portrait?20:40),use[1]+(portrait?40:-20),1];await touch('touchMove',[drag]);
      await page.waitForFunction(start=>bow.active&&player.yaw<start.yaw-.1&&player.pitch>start.pitch+.04,start);
      const forward=await centre('#touchForward');forward[2]=2;
      const scene=portrait?[250,420,3]:[420,140,3],sceneDrag=portrait?[245,450,3]:[450,145,3];
      await touch('touchStart',[drag,forward,scene]);await touch('touchMove',[drag,forward,sceneDrag]);
      await page.waitForFunction(start=>bow.active&&touchMove.z===1&&Math.hypot(player.p[0]-start.p[0],player.p[2]-start.p[2])>.2&&player.yaw<start.yaw-.2,start);
      await touch('touchEnd',[]);await page.waitForFunction(()=>projectiles.length===1&&!bow.active&&!useLookPointer&&!lookPointer&&!touchMove.z);
      assert(await page.evaluate(()=>{const p=projectiles[0],d=lookDir(),n=Math.hypot(...p.v);return p.v.reduce((s,v,i)=>s+v/n*d[i],0)>.98;}),'released arrow follows the new aim');
      await page.locator('#touchPause').tap();await page.locator('#savesButton').tap();
      assert(await page.evaluate(()=>{const r=$('savesDialog').getBoundingClientRect();return r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;}),'save selector fits the phone viewport');
      assert.equal(errors.length,0,errors.join('\n'));
      console.log(`PASS ${portrait?'portrait embedded browser':'landscape phone'}: drag the held bow button to aim, move and aim with other fingers, release once, and open saves`);
      await context.close();
    }
  } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
