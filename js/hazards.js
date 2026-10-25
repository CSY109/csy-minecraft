'use strict';

// Check the body, not just the block containing its centre. Liquid contact uses
// the rendered surface so shallow flows cannot burn an entity standing above them.
function entityEnvironment(x, y, z, width, height) {
  const r = width / 2 - 0.001, env = { fire: false, lava: false, water: false, magma: false };
  for (let yy = Math.floor(y + 0.001); yy <= Math.floor(y + height - 0.001); yy++)
    for (let zz = Math.floor(z - r); zz <= Math.floor(z + r); zz++)
      for (let xx = Math.floor(x - r); xx <= Math.floor(x + r); xx++) {
        const id = world.getBlock(xx, yy, zz);
        if (id === B.FIRE) env.fire = true;
        if (id !== B.WATER && id !== B.LAVA) continue;
        const xs = [clamp(x - r - xx, 0, 1), clamp(x + r - xx, 0, 1)];
        const zs = [clamp(z - r - zz, 0, 1), clamp(z + r - zz, 0, 1)];
        const h = [world.physics.cornerHeight(xx, yy, zz, id, 0, 0), world.physics.cornerHeight(xx, yy, zz, id, 1, 0),
          world.physics.cornerHeight(xx, yy, zz, id, 0, 1), world.physics.cornerHeight(xx, yy, zz, id, 1, 1)];
        const surface = Math.max(...xs.flatMap(fx => zs.map(fz => lerp(lerp(h[0], h[1], fx), lerp(h[2], h[3], fx), fz))));
        if (y + 0.001 < yy + surface) env[id === B.WATER ? 'water' : 'lava'] = true;
      }
  for (let zz = Math.floor(z - r); zz <= Math.floor(z + r); zz++)
    for (let xx = Math.floor(x - r); xx <= Math.floor(x + r); xx++)
      if (world.getBlock(xx, Math.floor(y - 0.04), zz) === B.MAGMA) env.magma = true;
  return env;
}
function clearBurning(state) {
  state.burnTime = 0; state.burnClock = 1; state.contactClock = 0; state.fireContact = '';
}
function updateEntityBurning(state, dt, env, hurt) {
  state.burnTime = Math.max(0, (state.burnTime || 0) - dt);
  if (env.water && !env.lava) { clearBurning(state); return; }
  const contact = env.lava ? 'lava' : env.fire ? 'fire' : '';
  if (contact) {
    state.burnTime = Math.max(state.burnTime, env.lava ? 15 : 8);
    if (state.fireContact !== contact) state.contactClock = 0;
    state.contactClock -= dt; state.burnClock = 1;
    if (state.contactClock <= 0) {
      hurt(env.lava ? 4 : 1, env.lava ? '熔岩' : '火焰');
      state.contactClock = env.lava ? 0.5 : 1;
    }
  } else if (state.burnTime > 0) {
    state.burnClock = (state.burnClock ?? 1) - dt;
    if (state.burnClock <= 0) { hurt(1, '燃烧'); state.burnClock += 1; }
  }
  state.fireContact = contact;
}
function trackEntityFall(state, y, grounded, cushioned, hurt) {
  if (cushioned) { state.fallTop = y; return; }
  state.fallTop = Math.max(state.fallTop ?? y, y);
  if (!grounded) return;
  // Ignore the collision solver's tiny landing clearance, while retaining the
  // partial block in a real fall (3.5 blocks must already hurt).
  const damage = Math.ceil(state.fallTop - y - 3 - 0.02);
  if (damage > 0) hurt(damage, '摔落');
  state.fallTop = y;
}
