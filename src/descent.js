// One "stroke" = running stochastic gradient descent from the ball's position
// with a fixed learning rate until it sinks, settles, explodes, or runs out of steps.
// Gradient noise is seeded per hole + stroke, so the same shot always plays the same.

const DESCENT = {
  holeRadius: 0.02,
  settledStep: 0.006
};

function seededNormal(seed) {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => {
    const u = Math.max(1e-9, uniform());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uniform());
  };
}

function planStroke(land, x0, eta, maxSteps, seed = 1) {
  const noise = land.level.noise || 0;
  const normal = seededNormal(seed);
  const path = [x0];
  let x = x0;
  for (let i = 0; i < maxSteps; i++) {
    const next = x - eta * (land.grad(x) + noise * normal());
    if (!Number.isFinite(next) || next < 0 || next > 1) {
      path.push(next < 0 ? -0.08 : 1.08);
      return { path, outcome: "exploded", end: x0 };
    }
    const step = Math.abs(next - x);
    path.push(next);
    x = next;
    if (Math.abs(x - land.xMin) < DESCENT.holeRadius && step < DESCENT.settledStep) {
      return { path, outcome: "sunk", end: x };
    }
  }
  const lastStep = Math.abs(path[path.length - 1] - path[path.length - 2]);
  const inHole = Math.abs(x - land.xMin) < DESCENT.holeRadius;
  let outcome = "stopped";
  if (inHole) outcome = "rattling";
  else if (lastStep < DESCENT.settledStep) outcome = "stuck";
  return { path, outcome, end: x };
}

function strokeSeed(hole, strokesSoFar) {
  return (hole + 1) * 7919 + strokesSoFar * 104729;
}

// Drag distance → learning rate on a log scale, so small and large η both get room.
function etaFromDrag(distance, span, etaMin, etaMax) {
  const t = Math.min(1, Math.max(0, distance / span));
  return etaMin * Math.pow(etaMax / etaMin, t);
}

function formatEta(eta) {
  if (eta >= 0.1) return eta.toFixed(2);
  if (eta >= 0.01) return eta.toFixed(3);
  return eta.toFixed(4);
}
