const assert = require('node:assert/strict');
const path = require('node:path');
module.exports = async page => {
  const results = await page.evaluate(() => {
    const results = [], assert = (v, message) => { if (!v) throw new Error(message); };
    const test = (name, fn) => { try { fn(); results.push({ name, pass: true }); } catch (error) { results.push({ name, pass: false, error: error.message }); } };
    world = new World(12345); mobs.length = projectiles.length = particles.length = 0; hotbar.fill(0); sel = 0; cancelBow();
    for (let cz = -2; cz <= 2; cz++) for (let cx = -2; cx <= 2; cx++) {
      const c = new Chunk(cx, cz); c.gen = true; c.maxY = 10; c.hm.fill(10); c.blocks.fill(B.STONE, 0, 11 * 256); world.chunks.set(world.key(cx, cz), c);
    }
    for (let y = 11; y <= 16; y++) for (let z = -6; z <= 6; z++) for (let x = -6; x <= 22; x++)
      if (y === 16 || x === -6 || x === 22 || x === 8 || z === -6 || z === 6) world.setBlock(x, y, z, B.STONE);
    const c = world.getChunk(0, 0);
    test('torch light attenuates by distance, is blocked by walls and disappears when removed', () => {
      world.setBlock(4, 11, 0, B.TORCH); world.lighting.prepare(c);
      assert(world.lighting.at(4, 11, 0) === 14 && world.lighting.at(5, 11, 0) === 13, 'torch intensity and attenuation');
      assert(world.lighting.at(12, 11, 0) === 0, 'closed wall blocks light');
      world.setBlock(4, 11, 0, B.AIR); world.lighting.prepare(c);
      assert(world.lighting.at(5, 11, 0) === 0, 'removing the light removes its illumination');
    });
    test('glowstone, fire and lava emit level 15 across chunks; magma emits level 3', () => {
      for (const [id, level] of [[B.GLOWSTONE,15],[B.FIRE,15],[B.LAVA,15],[B.MAGMA,3]]) {
        world.setBlock(15, 12, 0, id); world.lighting.prepare(c);
        assert(world.lighting.at(15, 12, 0) === level && world.lighting.at(16, 12, 0) === level - 1, 'emission crosses chunk boundary for ' + NAMES[id]);
        world.setBlock(15, 12, 0, B.AIR);
      }
    });
    test('coal and a stick craft four torches; unsupported torches drop; flint ignites persistent netherrack fire', () => {
      gameMode = 'survival'; bag[I.COAL] = 1; bag[I.STICK] = 1;
      craft(RECIPES.find(r => r.out === B.TORCH)); assert(countItem(B.TORCH) === 4 && !countItem(I.COAL) && !countItem(I.STICK), 'torch recipe');
      world.setBlock(4, 12, 1, B.TORCH); world.physics.update(0.1); assert(world.getBlock(4, 12, 1) === B.AIR && countItem(B.TORCH) === 5, 'unsupported torch drops');
      hotbar[0] = I.FLINT_STEEL; bag[I.FLINT_STEEL] = 1; world.setBlock(4, 10, 2, B.NETHERRACK);
      target = { x:4, y:10, z:2, nx:0, ny:1, nz:0 }; useHeldItem(); assert(world.getBlock(4,11,2) === B.FIRE, 'flint and steel makes fire');
      for (let n = 0; n < 300; n++) world.physics.update(0.05); assert(world.getBlock(4,11,2) === B.FIRE, 'netherrack fire persists');
      world.setBlock(4,11,2,B.AIR); world.setBlock(4,11,3,B.FIRE);
      for (let n = 0; n < 260; n++) world.physics.update(0.05); assert(!world.getBlock(4,11,3), 'ordinary fire expires');
    });
    gameMode = 'creative'; gameTime = DAY_LEN * 0.5; player.p = [4.5, 11.01, 4.5]; player.yaw = 0; player.pitch = -0.12; player.eyeWater = false; player.eyeH = 1.62; player.fovMul = 1;
    hotbar.fill(0); target = mobTarget = null; resetMining(); $('menu').style.display = 'none';
    const mesh = () => { for (const c of world.chunks.values()) if (world.canMesh(c)) uploadChunk(c, world.meshChunk(c)); };
    updateSky(); mesh(); updateHUD(); drawWorld(0);
    const before = new Uint8Array(canvas.width * canvas.height * 4); gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,before);
    world.setBlock(4,11,0,B.TORCH); mesh(); drawWorld(0);
    test('light sources brighten surrounding cave surfaces on the GPU, beyond the flame sprite', () => {
      const after = new Uint8Array(before.length); gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,after);
      let brighter = 0; for (let n = 0; n < after.length; n += 4) if (after[n]+after[n+1]+after[n+2] > before[n]+before[n+1]+before[n+2]+25) brighter++;
      assert(brighter > 10000, 'torch must illuminate surrounding surfaces: ' + brighter); assert(gl.getError() === gl.NO_ERROR, 'lighting WebGL state');
    });
    return results;
  });
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.error ? ': ' + r.error : ''}`);
  await page.screenshot({ path: path.join(__dirname, '..', 'test-results', 'torch-cave.png') });
  assert(results.every(r => r.pass), JSON.stringify(results.filter(r => !r.pass)));
  return results;
};
