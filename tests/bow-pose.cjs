const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async page => {
  const checks = await page.evaluate(() => {
    gameMode = 'creative'; hotbar[0] = I.BOW; sel = 0; selectedArrow = I.ARROW;
    cancelBow(); swing = 0; player.bob = 0; player.onGround = false;
    const transform = () => { const m = M4.create(); applyBowHandPose(m); return Array.from(m); };
    const idle = transform();
    mouseR = true; beginBow();
    const first = transform();
    const startContinuous = first.every((v, n) => Math.abs(v - idle[n]) < 1e-7);
    updateBow(1 / 60); updateBowPose(1 / 60);
    const next = transform(), step = Math.max(...next.map((v, n) => Math.abs(v - idle[n])));
    for (let n = 0; n < 60; n++) { updateBow(1 / 60); updateBowPose(1 / 60); }
    const full = transform();
    // The arrow in the imported sprite runs diagonally toward local (-X, +Y).
    const arrow = [full[4] - full[0], full[5] - full[1], full[6] - full[2]];
    const forward = -arrow[2] / Math.hypot(...arrow);
    const drawPixels = () => {
      resize(); gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.08, 0.12, 0.16, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      drawHand(1, [1, 1, 1], 0);
      const data = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
      return data;
    };
    const pixels = drawPixels(), bounds = { left: canvas.width, right: 0, top: canvas.height, bottom: 0, count: 0 };
    for (let n = 0; n < pixels.length; n += 4) {
      if (pixels[n] === pixels[0] && pixels[n + 1] === pixels[1] && pixels[n + 2] === pixels[2]) continue;
      const x = n / 4 % canvas.width, y = canvas.height - 1 - Math.floor(n / 4 / canvas.width);
      bounds.left = Math.min(bounds.left, x); bounds.right = Math.max(bounds.right, x);
      bounds.top = Math.min(bounds.top, y); bounds.bottom = Math.max(bounds.bottom, y); bounds.count++;
    }
    swing = 0.5; const withSwordSwing = drawPixels();
    const noSwordSwing = pixels.every((v, n) => v === withSwordSwing[n]); swing = 0;
    cancelBow(false); bow.recoil = 0.18;
    for (let n = 0; n < 24; n++) updateBowPose(1 / 60);
    const returned = transform();
    const returnsToIdle = returned.every((v, n) => Math.abs(v - idle[n]) < 1e-7);
    mouseR = true; beginBow(); updateBow(1); updateBowPose(1); cancelBow();
    const cancelled = !bow.active && !bow.raise && !bow.recoil;
    return { startContinuous, step, forward, bounds, width: canvas.width, height: canvas.height,
      noSwordSwing, returnsToIdle, cancelled, glError: gl.getError() };
  });
  assert(checks.startContinuous && checks.step > 0 && checks.step < 0.02, 'raising a bow must start smoothly from its resting pose');
  assert(checks.forward > 0.9, 'nocked arrow points into the world instead of across the screen');
  const b = checks.bounds;
  assert(b.count > 1000 && b.left > checks.width / 2 + 16 && b.right < checks.width - 16 && b.top > 16 && b.bottom < checks.height - 65,
    'drawn bow must stay fully visible, beside the crosshair and above the hotbar: ' + JSON.stringify(b));
  assert(checks.noSwordSwing, 'bow must not inherit sword slash motion');
  assert(checks.returnsToIdle && checks.cancelled && checks.glError === 0, 'release settles and cancellation clears bow pose');

  for (const [name, charge, raise, recoil] of [
    ['idle', -1, 0, 0], ['raising', 0.08, 0.48, 0], ['half', 0.55, 1, 0],
    ['full', 1, 1, 0], ['release', -1, 0.46, 0.09], ['settled', -1, 0, 0],
  ]) {
    await page.evaluate(({ charge, raise, recoil }) => {
      cancelBow(); swing = 0; bow.active = charge >= 0; bow.elapsed = Math.max(0, charge); bow.raise = raise; bow.recoil = recoil;
      target = mobTarget = null; particles.length = projectiles.length = 0;
      $('toast').style.transition = $('heldName').style.transition = 'none'; $('toast').style.opacity = $('heldName').style.opacity = 0;
      updateSky(); updateHUD(); refreshHotbar(); drawWorld(0);
    }, { charge, raise, recoil });
    await page.screenshot({ path: path.join(__dirname, '..', 'test-results', `bow-pose-${name}.png`) });
  }
  await page.evaluate(() => { cancelBow(); mouseR = false; });
  console.log('PASS bow raises smoothly, faces forward, fits the view and recoils without sword motion');
  return [{ name: 'bow raises smoothly, faces forward, fits the view and recoils without sword motion', pass: true }];
};
