const assert = require('node:assert/strict');
module.exports = async page => {
  const results = await page.evaluate(() => {
    const results = [], assert = (value, message) => { if (!value) throw new Error(message); };
    const test = (name, fn) => { try { fn(); results.push({name, pass:true}); } catch(e) {results.push({name,pass:false,error:e.message});} };
    const arena = () => {
      world = new World(12345); mobs.length = particles.length = projectiles.length = 0; spawnClock = 0;
      for (let cz=-1;cz<=1;cz++) for(let cx=-1;cx<=1;cx++) {
        const c=new Chunk(cx,cz); c.gen=true; c.maxY=10;c.hm.fill(10);c.blocks.fill(B.STONE,0,11*256);world.chunks.set(world.key(cx,cz),c);
      }
      gameMode='survival'; player.p=[0.5,11.001,0.5];player.v=[0,0,0];player.fly=false;player.onGround=true;player.sneak=false;player.inWater=player.eyeWater=false;
      hotbar.fill(0); sel=0;resetTouchInput();resetVitals();sky.d=0.3;
    };
    test('player body edges ignite immediately, keep burning on dry ground and extinguish in water', () => {
      arena();world.setBlock(1,11,0,B.FIRE);player.p[0]=0.8;updateVitals(0.05);
      assert(vitals.health===19 && vitals.burnTime===8,'edge of body touching fire must hurt immediately');
      player.p[0]=4.8; for(let n=0;n<21;n++)updateVitals(0.05);
      assert(vitals.health===18 && vitals.burnTime>6,'burning continues after leaving fire');
      world.setBlock(5,11,0,B.WATER);updateVitals(0.05);const hp=vitals.health;
      assert(vitals.burnTime===0,'edge of body touching water extinguishes');
      for(let n=0;n<25;n++)updateVitals(0.05);
      assert(vitals.health===hp,'water prevents residual burning damage');
    });
    test('lava hurts on edge contact repeatedly; a body above a shallow lava flow is safe', () => {
      arena();world.setBlock(1,11,0,B.LAVA);player.p[0]=0.8;
      for(let n=0;n<24;n++)updateVitals(0.05);
      assert(vitals.health===8 && vitals.burnTime===15,'lava deals 4 damage on contact and every half second');
      resetVitals();player.p[1]=11.95;updateVitals(0.05);
      assert(vitals.health===20 && !vitals.burnTime,'above rendered liquid surface is not contact');
      gameMode='creative';player.p[1]=11.001;updateVitals(1);
      assert(vitals.health===20&&!vitals.burnTime,'creative mode retains immunity');
    });
    test('all animals take fire and lava damage, burn after leaving, and use the death animation', () => {
      for(const type of ['pig','cow','sheep']) {
        arena();world.setBlock(5,11,5,B.FIRE);const m=spawnMob(type,5.8,11.001,5.5);m.turn=100;
        updateMobs(0.05);assert(m.hp===MOB_TYPES[type].hp-1&&m.burnTime>0,type+' edge fire contact');
        m.x=8.5;m.turn=100;
        for(let n=0;n<21;n++)updateMobs(0.05);
        assert(m.hp<=MOB_TYPES[type].hp-2,type+' residual burning');
        world.setBlock(Math.floor(m.x),Math.floor(m.y),Math.floor(m.z),B.WATER);updateMobs(0.01);
        assert(!m.burnTime,type+' extinguishes in water');
        arena();for(let x=3;x<=8;x++)for(let z=3;z<=8;z++)world.setBlock(x,11,z,B.LAVA);
        const victim=spawnMob(type,5.5,11.001,5.5);victim.turn=100;
        for(let n=0;n<36&&!victim.dying;n++)updateMobs(0.05);
        assert(victim.hp===0&&victim.dying&&victim.deathTime===0,type+' lava death enters animation');
      }
    });
    test('physical landings damage players and animals by fall distance; short drops and water cushion falls', () => {
      for(const [drop, damage] of [[3,0],[3.5,1],[7,4],[25,22]]) {
        arena();player.p[1]=11.001+drop;player.onGround=false;resetVitals();
        for(let n=0;n<200&&!player.onGround&&!dead;n++){updatePlayer(0.025);updateVitals(0.025);}
        assert(vitals.health===Math.max(0,20-damage),'fall '+drop+' blocks: '+vitals.health);
      }
      arena();world.setBlock(0,11,0,B.WATER);player.p[1]=30;player.onGround=false;resetVitals();
      for(let n=0;n<250&&!player.onGround;n++){updatePlayer(0.025);updateVitals(0.025);}
      assert(player.onGround&&vitals.health===20,'landing in water prevents fall damage');
      arena();const m=spawnMob('pig',5.5,18.001,5.5);m.turn=100;
      for(let n=0;n<200&&!m.grounded;n++)updateMobs(0.025);
      assert(m.grounded&&m.hp===6,'animal landing takes four damage from seven blocks: '+m.hp);
    });
    test('burning can kill the player, respawn reset clears it, and switching modes cancels it', () => {
      arena();vitals.health=1;world.setBlock(0,11,0,B.FIRE);updateVitals(0.05);
      assert(dead&&!$('death').hidden,'fire death opens respawn screen');
      resetVitals();assert(!dead&&!vitals.burnTime,'respawn reset clears burning');
      updateVitals(0.05);switchGameMode('creative');assert(!vitals.burnTime,'mode change clears burning');
    });
    // A small rendered scene verifies the real flame shaders and first-person sheet.
    arena(); const sheep=spawnMob('sheep',0.5,11.001,0.5);sheep.burnTime=8;
    player.p=[0.5,11.001,4.5];player.yaw=0;player.pitch=-0.15;player.eyeH=1.62;vitals.burnTime=8;gameTime=0;
    world.setBlock(0,11,0,B.FIRE);const c=world.getChunk(0,0);uploadChunk(c,world.meshChunk(c));
    $('menu').style.display='none';paused=false;$('mode').value=gameMode;
    updateSky();updateHUD();drawWorld(0);
    test('classic animated flames render on animals and around the player view without WebGL errors',()=>{
      assert(gl.getError()===gl.NO_ERROR,'fire shader WebGL state');assert(!$('fireOverlay').hidden,'first-person flames visible');
      const cv=$('fireOverlay'),pixels=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;
      assert(pixels.some((value,i)=>i%4===3&&value>100),'first-person fire contains visible pixels');
      assert(pixels[(30*cv.width+Math.floor(cv.width/2))*4+3]===0,'centre view stays clear');
    });
    return results;
  });
  for(const r of results)console.log(`${r.pass?'PASS':'FAIL'} ${r.name}${r.error?': '+r.error:''}`);
  assert(results.every(r=>r.pass),JSON.stringify(results.filter(r=>!r.pass)));
};
