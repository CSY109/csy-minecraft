const assert = require('node:assert/strict');
const path = require('node:path');
module.exports = async (browser, url) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage(), errors = [], results = [];
  page.on('pageerror', error => errors.push(error.message));
  const passed = name => { results.push({ name, pass:true }); console.log('PASS ' + name); };
  try {
    await page.goto(url);
    assert(await page.evaluate(()=>isTouchMode()), 'phone automatically selects touch controls');
    assert(await page.locator('#desktopMode,#mobileMode').count()===0, 'cover needs no device-selection buttons');
    assert(await page.title() === "csy's Minecraft", 'game title');
    assert(!await page.locator('#seed').isVisible() && !await page.locator('#help').isVisible(), 'cover hides settings and instructions');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'portrait cover fits without overflow');
    assert(await page.evaluate(()=>document.body.classList.contains('virtualLandscape')), 'portrait browser supplies a landscape game surface');
    assert(await page.locator('#rotateHint').count()===0, 'no blocking rotation prompt');
    await page.setViewportSize({ width:844, height:390 });
    await page.locator('#settingsButton').click(); await page.locator('#seed').fill('12345'); await page.locator('#rd').fill('3'); await page.locator('#closeSettings').click();
    await page.locator('#play').tap();
    await page.waitForFunction(() => started && hasGameFocus() && !$('touchControls').hidden);
    assert(await page.evaluate(() => isTouchMode() && !document.pointerLockElement), 'phone starts without pointer lock');
    assert(await page.evaluate(()=>!document.body.classList.contains('virtualLandscape')), 'physical landscape uses the normal game surface');
    for (const size of [{width:844,height:390},{width:667,height:375}]) {
      await page.setViewportSize(size);
      assert(await page.evaluate(() => {
        const ids = ['dpad','touchJump','touchAttack','touchUse','hotbar','touchBag','touchHealth','touchHunger','touchPause'];
        const rects = ids.map(id => ({id, r:$(id).getBoundingClientRect()}));
        return rects.every(({r}) => r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight) &&
          rects.every((a,i) => rects.slice(i+1).every(b => Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left)<=0 || Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top)<=0));
      }), 'landscape controls fit and do not overlap at '+size.width);
    }
    await page.setViewportSize({width:844,height:390});
    passed('portrait browser has a landscape fallback; landscape controls fit large and small phones without overlap');
    const cdp = await context.newCDPSession(page);
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id=1])=>({x,y,id}))});
    const center = async selector => { const b=await page.locator(selector).boundingBox(); return [b.x+b.width/2,b.y+b.height/2,1]; };
    await page.evaluate(() => {
      world = new World(12345); mobs.length = projectiles.length = 0;
      for(let cz=-2;cz<=2;cz++)for(let cx=-2;cx<=2;cx++){
        const c=new Chunk(cx,cz);c.gen=true;c.maxY=10;c.hm.fill(10);c.blocks.fill(B.STONE,0,11*256);world.chunks.set(world.key(cx,cz),c);
      }
      resetDimensions(); player.p=[0.5,11.01,0.5];player.v=[0,0,0];player.yaw=player.pitch=0;vitals.fallTop=11.01;
    });
    const forward=await center('#touchForward'), initial=await page.evaluate(()=>({p:player.p.slice(),yaw:player.yaw}));
    await touch('touchStart',[forward]);
    await page.waitForFunction(p=>Math.hypot(player.p[0]-p[0],player.p[2]-p[2])>0.35,initial.p);
    const right=(await center('#touchRight'));right[2]=3;
    await touch('touchStart',[forward,[450,140,2],right]);
    await touch('touchMove',[forward,[510,150,2],right]);
    await page.waitForFunction(yaw=>Math.abs(player.yaw-yaw)>0.1 && touchMove.z>0.5,initial.yaw,{timeout:5000});
    assert(await page.evaluate(()=>touchMove.x===1&&touchMove.z===1),'two directions support diagonal walking while looking');
    await touch('touchEnd',[]);
    await page.waitForFunction(()=>touchMove.x===0&&touchMove.z===0);
    passed('native multi-touch holds two direction keys while independently rotating the camera');

    await page.locator('#touchPause').tap();
    await page.waitForFunction(()=>paused&&$('menu').style.display==='flex',null,{timeout:3000});
    await page.locator('#mode').selectOption('creative'); await page.locator('#play').tap();
    await page.waitForFunction(()=>hasGameFocus()&&!$('touchFly').hidden); await page.locator('#touchFly').tap();
    await page.evaluate(()=>{player.p=[0.5,60,0.5];player.v=[0,0,0];});
    const jump=await center('#touchJump'); await touch('touchStart',[jump]); await page.waitForFunction(()=>player.p[1]>60.5); await touch('touchEnd',[]);
    const y=await page.evaluate(()=>player.p[1]), down=await center('#touchSneak'); await touch('touchStart',[down]); await page.waitForFunction(y=>player.p[1]<y-0.5,y);await touch('touchEnd',[]);
    await page.locator('#touchBag').tap(); await page.waitForFunction(()=>invOpen&&!hasGameFocus());
    const clock=await page.evaluate(()=>gameTime); await page.locator('#invSearch').fill('火把');
    assert(await page.getByRole('button',{name:'火把',exact:true}).count()===1,'phone inventory finds torch');
    assert(await page.evaluate(()=>gameTime)===clock,'backpack pauses phone simulation');
    await page.locator('#closeInv').tap(); await page.waitForFunction(()=>hasGameFocus());
    passed('phone creative flight ascends and descends, and the searchable backpack pauses and resumes');

    await page.evaluate(()=>{player.p=[0.5,11.01,0.5];player.v=[0,0,0];player.fly=false;player.yaw=0;player.pitch=-0.55;hotbar[0]=B.TORCH;sel=0;refreshHotbar();});
    await page.waitForFunction(()=>target?.id===B.STONE);
    const pos=await page.evaluate(()=>[target.x+target.nx,target.y+target.ny,target.z+target.nz]);
    const use=await center('#touchUse');await touch('touchStart',[use]);await touch('touchEnd',[]);
    assert(await page.evaluate(p=>world.getBlock(...p)===B.TORCH,pos),'phone use places torch');
    await page.evaluate(()=>{hotbar[0]=I.BOW;selectedArrow=I.EXPLOSIVE_ARROW;player.pitch=0.4;refreshHotbar();});
    await touch('touchStart',[use]);await page.waitForFunction(()=>bow.elapsed>=0.35);
    assert(await page.evaluate(()=>!projectiles.length),'hold does not auto-fire on phone');await touch('touchEnd',[]);
    assert(await page.evaluate(()=>projectiles.some(p=>p.type==='explosive_arrow')),'release shoots an explosive arrow on phone');
    await page.screenshot({path:path.join(__dirname,'..','test-results','mobile-game.png')});
    await page.locator('#touchPause').tap();await page.waitForFunction(()=>paused&&$('menu').style.display==='flex');
    assert(await page.evaluate(()=>!mouseL&&!mouseR&&!bow.active&&!touchMove.x&&!touchMove.z),'pause clears all touch inputs');
    assert.equal(errors.length,0,errors.join('\n'));
    passed('phone places torches, charges and fires explosive arrows, and safely pauses held actions');
    return results;
  } catch(error) {
    console.error('MOBILE STATE',await page.evaluate(()=>({paused,invOpen,focus:hasGameFocus(),mode:deviceMode,menu:$('menu').style.display,look:lookPointer,pad:[...dpadPointers],visual:{width:visualViewport.width,scale:visualViewport.scale}})));
    await page.screenshot({path:path.join(__dirname,'..','test-results','mobile-failure.png')});throw error;
  } finally { await context.close(); }
};
