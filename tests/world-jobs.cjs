const assert = require('node:assert/strict');

module.exports = async page => {
  const results = [];
  const passed = name => { results.push({ name, pass: true }); console.log('PASS ' + name); };
  await page.waitForFunction(() => !worldJobs.job, null, { polling: 25 });
  assert(await page.evaluate(() => worldJobs.available() && !worldJobs.disabled), 'world worker starts: ' + await page.evaluate(() => worldJobs.failure));
  await page.evaluate(() => {
    world = new World(12345); window.workerMainCalls = 0;
    world.generate = world.meshChunk = () => { window.workerMainCalls++; throw new Error('Terrain work ran on the main thread'); };
  });
  for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) {
    assert(await page.evaluate(({ x, z }) => worldJobs.generate(world, x, z), { x, z }), 'generation submitted');
    await page.waitForFunction(({ x, z }) => worldJobs.disabled || world.getChunk(x, z)?.gen && !worldJobs.job, { x, z }, { polling: 25 });
    assert(await page.evaluate(() => !worldJobs.disabled), await page.evaluate(() => worldJobs.failure));
  }
  const parity = await page.evaluate(() => {
    const expected = new World(12345);
    const hash = data => { let h = 2166136261; for (const n of new Uint8Array(data.buffer, data.byteOffset, data.byteLength)) h = Math.imul(h ^ n, 16777619); return h >>> 0; };
    window.workerHash = hash;
    expected.generate(0, 0);
    const a = world.getChunk(0, 0), b = expected.getChunk(0, 0), parity = { blocks: hash(a.blocks) === hash(b.blocks), hm: hash(a.hm) === hash(b.hm) };
    world.setBlock(7, 85, 7, B.WATER, 3); world.setBlock(8, 85, 7, B.WATER, 5);
    world.setBlock(6, 84, 7, B.STONE); world.setBlock(6, 85, 7, B.TORCH);
    const mesh = World.prototype.meshChunk.call(world, a);
    window.workerExpectedMesh = { opaque: hash(mesh.opaque), water: hash(mesh.water), opaqueLength: mesh.opaque.length, waterLength: mesh.water.length };
    return parity;
  });
  assert(parity.blocks && parity.hm, 'worker generation matches synchronous seeded terrain');
  await page.evaluate(() => worldJobs.mesh(world, world.getChunk(0, 0)));
  await page.waitForFunction(() => !worldJobs.job && !!world.getChunk(0, 0).mesh, null, { polling: 25 });
  assert(await page.evaluate(() => {
    const c = world.getChunk(0, 0), expected = window.workerExpectedMesh;
    return ['opaque', 'water'].every(key => {
      const mesh = c.mesh[key === 'opaque' ? 'o' : 'w'], data = new Float32Array(expected[key + 'Length']);
      if (!mesh) return !data.length;
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo); gl.getBufferSubData(gl.ARRAY_BUFFER, 0, data);
      return window.workerHash(data) === expected[key];
    }) && !window.workerMainCalls && !worldJobs.disabled;
  }), 'worker meshes and fluid levels match the synchronous geometry without main-thread generation or meshing');
  passed('background generation and meshing match seeded terrain and sloped fluids without main-thread terrain work');

  await page.evaluate(() => {
    const c = world.getChunk(0, 0); window.workerOldMesh = c.mesh;
    worldJobs.mesh(world, c); world.setBlock(7, 85, 7, B.DIAMOND_BLOCK);
  });
  await page.waitForFunction(() => !worldJobs.job, null, { polling: 25 });
  assert(await page.evaluate(() => world.getChunk(0, 0).mesh === window.workerOldMesh && world.getChunk(0, 0).dirty && world.getBlock(7, 85, 7) === B.DIAMOND_BLOCK), 'late mesh cannot overwrite an edit');
  await page.evaluate(() => {
    worldJobs.generate(world, 4, 4);
    world.edits.set(world.key(4, 4), new Map([[8 + 8 * 16 + 85 * 256, B.DIAMOND_BLOCK]]));
  });
  await page.waitForFunction(() => !worldJobs.job && world.getChunk(4, 4)?.gen, null, { polling: 25 });
  assert(await page.evaluate(() => world.getBlock(72, 85, 72) === B.DIAMOND_BLOCK && world.heightAt(72, 72) === 85), 'generation completion preserves latest edits and height map');
  await page.evaluate(() => { worldJobs.generate(world, 5, 5); world = new World(6789, 'nether'); });
  await page.waitForFunction(() => !worldJobs.job, null, { polling: 25 });
  assert(await page.evaluate(() => !world.getChunk(5, 5)), 'old-world jobs cannot leak into a different dimension');
  passed('late background jobs preserve edits and cannot install stale meshes or chunks into another dimension');
  return results;
};
