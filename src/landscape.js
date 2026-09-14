// Loss landscapes: a quadratic bowl minus Gaussian dips, over θ ∈ [0, 1].
// Each landscape is rescaled so the global minimum has loss 0 and a
// chosen curvature K, which fixes the critical learning rate at 2 / K.

function rawLoss(level, x) {
  let y = level.bowl.a * (x - level.bowl.c) ** 2;
  for (const dip of level.dips) {
    const z = (x - dip.mu) / dip.sigma;
    y -= dip.depth * Math.exp(-0.5 * z * z);
  }
  return y;
}

function rawGrad(level, x) {
  let dy = 2 * level.bowl.a * (x - level.bowl.c);
  for (const dip of level.dips) {
    const z = (x - dip.mu) / dip.sigma;
    dy += dip.depth * Math.exp(-0.5 * z * z) * (z / dip.sigma);
  }
  return dy;
}

function rawCurvature(level, x) {
  let d2 = 2 * level.bowl.a;
  for (const dip of level.dips) {
    const z = (x - dip.mu) / dip.sigma;
    d2 += dip.depth * Math.exp(-0.5 * z * z) * (1 - z * z) / (dip.sigma * dip.sigma);
  }
  return d2;
}

function findGlobalMin(level) {
  let best = 0;
  let bestY = Infinity;
  for (let i = 0; i <= 4000; i++) {
    const x = i / 4000;
    const y = rawLoss(level, x);
    if (y < bestY) { bestY = y; best = x; }
  }
  // Polish with a few Newton steps on the gradient.
  for (let i = 0; i < 8; i++) {
    const k = rawCurvature(level, best);
    if (k <= 0) break;
    best = Math.min(1, Math.max(0, best - rawGrad(level, best) / k));
  }
  return best;
}

function makeLandscape(level) {
  const xMin = findGlobalMin(level);
  const scale = level.curvature / rawCurvature(level, xMin);
  const base = rawLoss(level, xMin);
  const loss = x => scale * (rawLoss(level, x) - base);
  const grad = x => scale * rawGrad(level, x);

  let maxLoss = 0;
  const samples = [];
  for (let i = 0; i <= 240; i++) {
    const x = i / 240;
    const y = loss(x);
    samples.push({ x, y });
    if (y > maxLoss) maxLoss = y;
  }

  return { level, xMin, loss, grad, maxLoss, samples, criticalEta: 2 / level.curvature };
}
