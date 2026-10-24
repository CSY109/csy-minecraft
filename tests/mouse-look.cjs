const assert = require('node:assert/strict');

module.exports = async page => {
  const result = await page.evaluate(() => {
    const send = (x, y) => document.dispatchEvent(new MouseEvent('mousemove', { movementX: x, movementY: y }));
    player.yaw = 0.3; player.pitch = 0.1; mouseLookReady = false;
    send(900, 600);
    const lockStable = player.yaw === 0.3 && player.pitch === 0.1;
    send(12, -7);
    const yaw = player.yaw, pitch = player.pitch;
    const normal = Math.abs(yaw - (0.3 - 12 * 0.0022)) < 1e-9 && Math.abs(pitch - (0.1 + 7 * 0.0022)) < 1e-9;
    send(innerWidth * 2, innerHeight * 2); applyMouseLook({ movementX: NaN, movementY: Infinity });
    const warpStable = player.yaw === yaw && player.pitch === pitch;
    for (let n = 0; n < 100; n++) send(1, 0);
    const ordinaryUnfiltered = Math.abs(player.yaw - (yaw - 0.22)) < 1e-8;
    send(-8, 2);
    const recovered = Math.abs(player.yaw - (yaw - 0.22 + 8 * 0.0022)) < 1e-8 && Number.isFinite(player.pitch);
    player.yaw = player.pitch = 0;
    return { lockStable, normal, warpStable, ordinaryUnfiltered, recovered };
  });
  assert(Object.values(result).every(Boolean), 'mouse lock, warp rejection, ordinary input and recovery: ' + JSON.stringify(result));
  console.log('PASS mouse look ignores lock jumps and invalid spikes while retaining normal and fast accumulated turns');
  return [{ name: 'mouse look ignores lock jumps and invalid spikes while retaining normal and fast accumulated turns', pass: true }];
};
