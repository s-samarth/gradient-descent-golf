// One "stroke" = gradient descent with momentum (the "heavy ball" method):
//   v ← β·v − η·slope,   θ ← θ + v
// β = 0 is plain gradient descent. Fully deterministic, so the aim preview never lies.

const DESCENT = {
  holeRadius: 0.02,
  settledStep: 0.006
};

function descentStep(land, x, v, eta, momentum) {
  const nextV = momentum * v - eta * land.grad(x);
  return { x: x + nextV, v: nextV };
}

function planStroke(land, x0, eta, maxSteps, momentum = 0) {
  const path = [x0];
  let x = x0;
  let v = 0;
  for (let i = 0; i < maxSteps; i++) {
    ({ x, v } = descentStep(land, x, v, eta, momentum));
    if (!Number.isFinite(x) || x < 0 || x > 1) {
      path.push(x < 0 || !Number.isFinite(x) ? -0.08 : 1.08);
      return { path, outcome: "exploded", end: x0 };
    }
    path.push(x);
    if (Math.abs(x - land.xMin) < DESCENT.holeRadius && Math.abs(v) < DESCENT.settledStep) {
      return { path, outcome: "sunk", end: x };
    }
  }
  const inHole = Math.abs(x - land.xMin) < DESCENT.holeRadius;
  let outcome = "stopped";
  if (inHole) outcome = "rattling";
  else if (Math.abs(v) < DESCENT.settledStep) outcome = "stuck";
  return { path, outcome, end: x };
}

// What the next few steps look like from here, for the aim preview and meter colors.
// "explode": leaves the course. "overshoot": jumps back and forth with growing steps.
// "bouncy": crosses the valley but calms down. "smooth": heads downhill. "crawl": barely moves.
function classifyShot(land, x0, eta, momentum, steps = 8) {
  let x = x0;
  let v = 0;
  let prevStep = 0;
  let flips = 0;
  let growing = 0;
  let travelled = 0;
  for (let i = 0; i < steps; i++) {
    const next = descentStep(land, x, v, eta, momentum);
    if (!Number.isFinite(next.x) || next.x < 0 || next.x > 1) return "explode";
    const step = next.x - x;
    if (prevStep && Math.sign(step) !== Math.sign(prevStep)) {
      flips += 1;
      if (Math.abs(step) > Math.abs(prevStep) * 1.05) growing += 1;
    }
    travelled += Math.abs(step);
    prevStep = step;
    ({ x, v } = next);
  }
  if (growing >= 2) return "overshoot";
  if (flips >= 2) return "bouncy";
  if (travelled < 0.01) return "crawl";
  return "smooth";
}

// Drag distance → learning rate on a log scale, so small and large η both get room.
function etaFromDrag(distance, span, etaMin, etaMax) {
  const t = Math.min(1, Math.max(0, distance / span));
  return etaMin * Math.pow(etaMax / etaMin, t);
}

function etaToFraction(eta, etaMin, etaMax) {
  return Math.log(eta / etaMin) / Math.log(etaMax / etaMin);
}

function formatEta(eta) {
  if (eta >= 0.1) return eta.toFixed(2);
  if (eta >= 0.01) return eta.toFixed(3);
  return eta.toFixed(4);
}
