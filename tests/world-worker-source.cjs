const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const main = vm.createContext({ console, performance });
for (const file of ['util', 'blocks', 'items', 'lighting', 'world', 'physics', 'dimensions', 'world-jobs']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', file + '.js'), 'utf8'), main);
}
const messages = [], worker = vm.createContext({ self: { postMessage: data => messages.push(data) } });
vm.runInContext(vm.runInContext('worldWorkerSource()', main), worker);
worker.self.onmessage({ data: { type: 'generate', id: 1, seed: 12345, dimension: 'overworld', cx: 0, cz: 0, edits: [] } });
assert(!messages[0].error, messages[0].error);
assert.equal(messages[0].blocks.length, 16 * 16 * 96);
console.log('PASS isolated worker source generates terrain');
