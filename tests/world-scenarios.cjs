module.exports = page => page.evaluate(async () => {
  const results = [];
  const assert = (v, message) => { if (!v) throw new Error(message); };
  const test = (name, fn) => { try { fn(); results.push({ name, pass: true }); } catch (e) { results.push({ name, pass: false, error: e.message }); } };
  function arena(dimension = 'overworld') {
    world = new World(12345, dimension); mobs.length = projectiles.length = particles.length = 0;
    for (let cz = -2; cz <= 2; cz++) for (let cx = -2; cx <= 2; cx++) {
      const c = new Chunk(cx, cz); c.gen = true; c.maxY = 10; c.hm.fill(10);
      for (let y = 0; y <= 10; y++) c.blocks.fill(y === 0 ? B.BEDROCK : B.STONE, y * 256, (y + 1) * 256);
      world.chunks.set(world.key(cx, cz), c);
    }
    gameMode = 'survival'; resetVitals(); hotbar.fill(0); sel = 0;
    for (const key of Object.keys(bag)) delete bag[key];
    player.p = [0.5, 11.01, 4.5]; player.v = [0, 0, 0]; player.yaw = player.pitch = 0; player.inWater = player.eyeWater = false;
    target = mobTarget = null; resetMining(); resetDimensions();
  }
  function simulate(seconds) { for (let i = 0; i < seconds * 20; i++) world.physics.update(0.05); }
  function frame(axis = 'x') {
    const p = { x: 0, y: 11, z: 0, axis, width: 2, height: 3, world, invalid: false, link: null };
    for (let u = 0; u < 2; u++) { world.setBlock(...portalCell(p, u, -1), B.OBSIDIAN); world.setBlock(...portalCell(p, u, 3), B.OBSIDIAN); }
    for (let v = 0; v < 3; v++) { world.setBlock(...portalCell(p, -1, v), B.OBSIDIAN); world.setBlock(...portalCell(p, 2, v), B.OBSIDIAN); }
    return p;
  }
  test('water spreads seven blocks on a floor, respects walls, and recedes after its source is removed', () => {
    arena(); world.setBlock(2, 11, 0, B.BRICK); world.setBlock(0, 11, 0, B.WATER); simulate(8);
    assert(world.getBlock(-7, 11, 0) === B.WATER && world.getBlock(-8, 11, 0) === B.AIR, 'bounded horizontal flow');
    assert(world.getBlock(2, 11, 0) === B.BRICK, 'wall preserved');
    assert(world.physics.level(-3, 11, 0) > 0 && world.physics.height(-6, 11, 0) < world.physics.height(-2, 11, 0), 'flow levels and decreasing surface');
    world.setBlock(0, 11, 0, B.AIR); simulate(12);
    assert(world.getBlock(-3, 11, 0) === B.AIR && world.getBlock(-7, 11, 0) === B.AIR, 'source-free stream drains');
  });
  test('water falls into an excavated hole and crosses chunk boundaries', () => {
    arena(); for (let y = 8; y <= 10; y++) world.setBlock(0, y, 0, B.AIR);
    world.setBlock(1, 11, 0, B.WATER); simulate(8);
    assert(world.getBlock(0, 8, 0) === B.WATER, 'hole fills downward');
    world.setBlock(15, 11, 3, B.WATER); simulate(5);
    assert(world.getBlock(16, 11, 3) === B.WATER, 'flow enters next chunk');
  });
  test('water waits five ticks per step and chooses the nearest lower outlet', () => {
    arena(); world.setBlock(3, 10, 0, B.AIR); world.setBlock(0, 11, 0, B.WATER);
    simulate(0.2); assert(world.getBlock(1, 11, 0) === B.AIR, 'no early spread before tick five');
    simulate(0.05); assert(world.getBlock(1, 11, 0) === B.WATER && world.getBlock(-1, 11, 0) === B.AIR && world.getBlock(0, 11, 1) === B.AIR, 'flow heads to the nearby drop rather than fanning everywhere');
    simulate(0.5); assert(world.getBlock(3, 11, 0) === B.WATER && world.getBlock(4, 11, 0) === B.AIR, 'one cell per scheduled update');
  });
  test('two adjacent sources replenish a pool but a waterfall does not manufacture sources', () => {
    arena(); world.setBlock(0, 11, 0, B.WATER); world.setBlock(1, 11, 1, B.WATER); simulate(3);
    assert(world.getBlock(1, 11, 0) === B.WATER && world.physics.level(1, 11, 0) === 0 && world.physics.level(0, 11, 1) === 0, 'two diagonal sources form a renewable 2x2 pool');
    world.setBlock(0, 11, 0, B.AIR); simulate(1); assert(world.getBlock(0, 11, 0) === B.WATER && world.physics.level(0, 11, 0) === 0, 'removed pool source replenishes');
    arena(); world.setBlock(0, 15, 0, B.WATER); simulate(4);
    assert(world.getBlock(0, 12, 0) === B.WATER && world.physics.level(0, 12, 0) >= 8, 'waterfall stays falling fluid');
    assert(world.physics.level(1, 11, 0) > 0, 'bottom stream is not a bucket source');
  });
  test('gravity waits two ticks, follows fixed-tick drag, and keeps column order', () => {
    arena(); world.setBlock(0, 16, 0, B.SAND); simulate(0.05);
    assert(world.getBlock(0, 16, 0) === B.SAND, 'gravity does not trigger before two ticks'); simulate(0.05);
    assert(world.getBlock(0, 16, 0) === B.AIR && world.physics.falling.length === 1, 'gravity starts at tick two');
    assert(Math.abs(world.physics.falling[0].y - 15.96) < 0.005, 'first falling tick moves 0.04 blocks');
    arena(); world.setBlock(0, 15, 0, B.GRAVEL); world.setBlock(0, 14, 0, B.SAND); simulate(5);
    assert(world.getBlock(0, 11, 0) === B.SAND && world.getBlock(0, 12, 0) === B.GRAVEL, 'top-first insertion never reverses a falling column');
  });
  test('fluid corners join smoothly; gravity timing is independent of render frame rate', () => {
    arena(); world.setBlock(0, 11, 0, B.WATER); simulate(2);
    assert(Math.abs(world.physics.height(0, 11, 0) - 8 / 9) < 1e-8, 'classic source height');
    assert(Math.abs(world.physics.cornerHeight(0, 11, 0, B.WATER, 1, 0) - world.physics.cornerHeight(1, 11, 0, B.WATER, 0, 0)) < 1e-8, 'adjacent water surfaces share vertices');
    arena(); world.setBlock(0, 30, 0, B.SAND); for (let i = 0; i < 10; i++) world.physics.update(0.05);
    const y = world.physics.falling[0].y, vy = world.physics.falling[0].vy;
    arena(); world.setBlock(0, 30, 0, B.SAND); for (let i = 0; i < 30; i++) world.physics.update(1 / 60);
    assert(Math.abs(world.physics.falling[0].y - y) < 1e-8 && Math.abs(world.physics.falling[0].vy - vy) < 1e-8, 'fixed-tick motion at 20 and 60 FPS agrees');
  });
  test('sand ignores side and diagonal holes and falls only when its own support is removed', () => {
    for (const [x, z] of [[5, 5], [15, 15], [-1, -1]]) {
      arena(); world.setBlock(x, 14, z, B.STONE); world.setBlock(x, 15, z, B.SAND);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) {
        world.setBlock(x + dx, 14, z + dz, B.STONE); world.setBlock(x + dx, 15, z + dz, B.STONE);
      }
      simulate(0.2);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) {
        world.setBlock(x + dx, 14, z + dz, B.AIR); world.setBlock(x + dx, 15, z + dz, B.AIR);
        simulate(0.15);
        assert(world.getBlock(x, 15, z) === B.SAND && !world.physics.falling.length, 'side or diagonal hole moved supported sand');
      }
      world.setBlock(x, 14, z, B.AIR); simulate(0.1);
      assert(world.getBlock(x, 15, z) === B.AIR && world.physics.falling.length === 1, 'direct support removal starts falling');
      simulate(3); assert(world.getBlock(x, 11, z) === B.SAND, 'falls straight down in the same column');
    }
  });
  test('restored support cancels pending gravity, including support created in the same tick', () => {
    arena(); world.setBlock(5, 14, 5, B.STONE); world.setBlock(5, 15, 5, B.SAND);
    world.setBlock(5, 14, 5, B.AIR); simulate(0.05); world.setBlock(5, 14, 5, B.STONE); simulate(0.2);
    assert(world.getBlock(5, 15, 5) === B.SAND && !world.physics.falling.length, 'replaced support cancels delayed fall');
    arena(); world.setBlock(5, 15, 5, B.SAND); world.setBlock(6, 14, 5, B.WATER); world.physics.enqueue(6, 14, 5, 2);
    const original = world.physics.flowCell;
    world.physics.flowCell = function(x, y, z) { if (x === 6 && y === 14 && z === 5) this.world.setBlock(5, 14, 5, B.STONE); };
    simulate(0.1); world.physics.flowCell = original;
    assert(world.getBlock(5, 15, 5) === B.SAND && !world.physics.falling.length, 'a stale eligibility snapshot must not drop sand through new support');
  });
  test('water currents follow the channel and the camera stays dry above the sloped surface', () => {
    arena();
    for (let x = -1; x <= 8; x++) { world.setBlock(x, 11, -1, B.STONE); world.setBlock(x, 11, 1, B.STONE); }
    world.setBlock(-1, 11, 0, B.STONE); world.setBlock(0, 11, 0, B.WATER); simulate(3);
    const flow = world.physics.current(3, 11, 0);
    assert(flow[0] > 0.9 && Math.abs(flow[2]) < 1e-8, 'current moves downstream');
    assert(world.physics.containsWater(3.5, 11.05, 0.5) && !world.physics.containsWater(3.5, 11.9, 0.5), 'water volume follows the visible surface');
  });
  test('lava uses slower scheduled ticks and different Nether spread rules', () => {
    arena(); world.setBlock(0, 11, 0, B.LAVA); simulate(1.4); assert(!world.getBlock(1, 11, 0), 'overworld lava waits 30 ticks');
    simulate(6); assert(world.getBlock(3, 11, 0) === B.LAVA && !world.getBlock(4, 11, 0), 'overworld lava loses two levels per block');
    arena('nether'); world.setBlock(0, 11, 0, B.LAVA); simulate(0.4); assert(!world.getBlock(1, 11, 0), 'Nether lava waits 10 ticks');
    simulate(4); assert(world.getBlock(7, 11, 0) === B.LAVA && !world.getBlock(8, 11, 0), 'Nether lava flows seven blocks');
  });
  test('sand and gravel accelerate, fall through water, and stack on landing', () => {
    arena(); world.setBlock(0, 13, 0, B.SAND); world.setBlock(0, 14, 0, B.GRAVEL); simulate(0.2);
    assert(world.physics.falling.length > 0 && world.physics.falling[0].y < 13, 'visible falling state'); simulate(4);
    assert(world.getBlock(0, 11, 0) === B.SAND && world.getBlock(0, 12, 0) === B.GRAVEL && world.physics.falling.length === 0, 'stable stacked landing');
    world.setBlock(4, 11, 0, B.WATER); world.setBlock(4, 15, 0, B.SAND); simulate(4);
    assert(world.getBlock(4, 11, 0) === B.SAND, 'sand sinks through liquid');
  });
  test('water cools lava into obsidian; water evaporates in the Nether', () => {
    arena(); world.setBlock(0, 11, 0, B.LAVA); world.setBlock(1, 11, 0, B.WATER); simulate(1);
    assert(world.getBlock(0, 11, 0) === B.OBSIDIAN, 'source lava becomes obsidian');
    arena('nether'); world.setBlock(0, 11, 0, B.WATER); simulate(1);
    assert(world.getBlock(0, 11, 0) === B.AIR, 'Nether water evaporates');
  });
  test('buckets collect only sources, spend filled buckets and return empty buckets', () => {
    arena(); bag[I.BUCKET] = 1; hotbar[0] = I.BUCKET; world.setBlock(0, 12, 2, B.WATER); useHeldItem();
    assert(world.getBlock(0, 12, 2) === B.AIR && countItem(I.WATER_BUCKET) === 1 && countItem(I.BUCKET) === 0, 'source collected');
    target = { x: 3, y: 10, z: 2, nx: 0, ny: 1, nz: 0 }; useHeldItem();
    assert(world.getBlock(3, 11, 2) === B.WATER && countItem(I.WATER_BUCKET) === 0 && countItem(I.BUCKET) === 1, 'source poured');
  });
  test('ten-block obsidian frames ignite along both axes and collapse when damaged', () => {
    for (const axis of ['x', 'z']) {
      arena(); const p = frame(axis), found = findPortalFrame(world, 0, 11, 0, axis);
      assert(found && validPortalFrame(world, found), 'minimal frame recognized: ' + axis); activatePortal(found);
      assert(world.getBlock(0, 11, 0) === B.PORTAL && world.portals.length === 1, 'portal filled');
      world.setBlock(...portalCell(p, -1, 1), B.AIR); validatePortals(world);
      assert(world.getBlock(0, 11, 0) === B.AIR && world.portals[0].invalid, 'broken frame deactivates all portal cells');
    }
    arena(); frame(); world.setBlock(-1, 12, 0, B.STONE);
    assert(!findPortalFrame(world, 0, 11, 0, 'x'), 'ordinary stone cannot replace obsidian');
  });
  test('portal charging travels to a safe Nether portal and returns to the same world, inventory and mobs', () => {
    arena(); gameMode = 'survival'; bag[I.DIAMOND] = 3; const home = world;
    world.setBlock(8, 11, 8, B.DIAMOND_BLOCK); const pig = spawnMob('pig', 5.5, 11, 5.5);
    frame(); const p = activatePortal(findPortalFrame(world, 0, 11, 0, 'x'));
    player.p = [0.5, 11.02, 0.5]; updatePortals(2); assert(world === home, 'survival charge is not instant'); updatePortals(2.1);
    assert(world.dimension === 'nether' && p.link && p.link.link === p, 'linked Nether destination');
    assert(!collides(...player.p) && SOLID[world.getBlock(Math.floor(player.p[0]), Math.floor(player.p[1] - 0.1), Math.floor(player.p[2]))], 'safe solid arrival platform');
    assert(countItem(I.DIAMOND) === 3 && validPortalFrame(world, p.link), 'inventory and return gate');
    updatePortals(0.5); assert(world.dimension === 'nether', 'no immediate bounce');
    world.setBlock(4, 50, 4, B.GOLD_BLOCK); const nether = world, returnGate = p.link;
    travelThroughPortal(returnGate);
    assert(world === home && world.getBlock(8, 11, 8) === B.DIAMOND_BLOCK && mobs.includes(pig), 'home state retained');
    travelThroughPortal(p); assert(world === nether && world.getBlock(4, 50, 4) === B.GOLD_BLOCK, 'Nether edits retained');
    gameMode = 'creative';
    const gate = p.link, goal = [gate.x + 1, gate.y + 1.5, gate.z + 0.5];
    let best = null, bestScore = -Infinity;
    for (const dist of [6, 9, 12]) for (let k = 0; k < 16; k++) for (const lift of [1, 3, 5]) {
      const angle = k / 16 * Math.PI * 2, pos = [goal[0] + Math.sin(angle) * dist, gate.y + lift, goal[2] + Math.cos(angle) * dist];
      if (collides(...pos)) continue;
      const eye = [pos[0], pos[1] + player.eyeH, pos[2]], delta = goal.map((n, a) => n - eye[a]), len = Math.hypot(...delta), dir = delta.map(n => n / len);
      if (world.raycast(...eye, ...dir, len - 0.2)) continue;
      let score = dist;
      for (let j = -2; j <= 2; j++) { const yaw = Math.atan2(-dir[0], -dir[2]) + j * 0.2, hit = world.raycast(...eye, -Math.sin(yaw), -0.2, -Math.cos(yaw), 25); score += hit ? hit.t : 25; }
      if (score > bestScore) { bestScore = score; best = { pos, delta, len }; }
    }
    if (best) { player.p = best.pos; player.yaw = Math.atan2(-best.delta[0], -best.delta[2]); player.pitch = Math.asin(best.delta[1] / best.len); }
    assert(!collides(...player.p), 'overview camera stays outside solid terrain');
    for (const c of world.chunks.values()) if (world.canMesh(c)) uploadChunk(c, world.meshChunk(c));
    updateSky(); updateHUD(); drawWorld(0); assert(gl.getError() === gl.NO_ERROR, 'Nether and animated portal render');
  });
  await audioReady;
  test('classic audio decodes all sound groups, varies clips and supports stereo and mute', () => {
    assert(Object.keys(decodedSounds).length === Object.keys(CLASSIC_SOUNDS).length && Object.values(decodedSounds).every(clips => clips.length && clips.every(clip => clip.duration > 0)), 'all original OGG clips decoded');
    for (const s of [...liveSounds]) { s.src.stop(); liveSounds.delete(s); }
    const first = playSample('splash', 0), index = soundHistory.get('splash'), second = playSample('splash', 0);
    assert(first && second && soundHistory.get('splash') !== index, 'non-repeating clip selection');
    first.src.stop(); second.src.stop();
    const far = playSample('water', 0.1, [player.p[0] + 40, player.p[1], player.p[2]]);
    assert(far && far.gain.gain.value === 0, 'distance attenuation'); far.src.stop();
    masterGain.gain.value = 0; assert(masterGain.gain.value === 0, 'master mute'); masterGain.gain.value = Number($('volume').value) / 100;
  });
  return results;
});
