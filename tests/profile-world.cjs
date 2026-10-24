const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({ performance, console, soundAt() {}, addItem() {} });
for (const file of ['util', 'blocks', 'items', 'lighting', 'world', 'physics', 'dimensions']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', file + '.js'), 'utf8'), context, { filename: file + '.js' });
}
vm.runInContext(`
  const w = new World(12345), generation = [], meshes = [];
  for (let z = -2; z <= 2; z++) for (let x = -2; x <= 2; x++) {
    const start = performance.now(); w.generate(x, z); generation.push(performance.now() - start);
  }
  for (const c of w.chunks.values()) if (w.canMesh(c)) {
    const start = performance.now(); w.meshChunk(c); meshes.push(performance.now() - start);
  }
  const times = []; for (let n = 0; n < 100; n++) {
    const start = performance.now(); w.physics.stepTick(); times.push(performance.now() - start);
  }
  console.log(JSON.stringify({ generateMaxMs: Math.max(...generation), meshMaxMs: Math.max(...meshes),
    physicsMaxMs: Math.max(...times), physicsQueue: w.physics.queue.size }, null, 2));
`, context);
