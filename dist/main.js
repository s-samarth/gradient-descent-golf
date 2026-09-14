(function () {
"use strict";

// ---- levels.js ----
// Nine holes. bowl = a·(θ − c)², dips = Gaussian valleys, curvature = f''
// at the global minimum (critical η = 2 / curvature). noise = SGD gradient noise (kick size scales with η). Check with tools/solve.mjs.

const LEVELS = [
  {
    name: "Convex warmup",
    tip: "One valley. Any sane η gets you there.",
    bowl: { a: 1, c: 0.62 }, dips: [], start: 0.06, noise: 0, curvature: 30, par: 2
  },
  {
    name: "Steep bowl",
    tip: "High curvature. Too much η and you bounce out.",
    bowl: { a: 1, c: 0.4 }, dips: [], start: 0.94, noise: 0, curvature: 140, par: 2
  },
  {
    name: "Local trap",
    tip: "Noisy gradients now. Bigger η, bigger kicks.",
    bowl: { a: 1.4, c: 0.6 },
    dips: [{ mu: 0.28, depth: 0.22, sigma: 0.045 }, { mu: 0.72, depth: 0.12, sigma: 0.05 }],
    start: 0.05, noise: 0.6, curvature: 40, par: 3
  },
  {
    name: "The plateau",
    tip: "Flat ground, tiny gradients. Crawl or leap?",
    bowl: { a: 0.15, c: 0.9 },
    dips: [{ mu: 0.82, depth: 0.2, sigma: 0.06 }],
    start: 0.08, noise: 0.5, curvature: 45, par: 4
  },
  {
    name: "Narrow minimum",
    tip: "Sharp hole. Finish with a gentle η.",
    bowl: { a: 0.9, c: 0.52 },
    dips: [{ mu: 0.52, depth: 0.08, sigma: 0.018 }],
    start: 0.92, noise: 0.4, curvature: 160, par: 3
  },
  {
    name: "Twin valleys",
    tip: "Two look alike. Only one is global.",
    bowl: { a: 0.6, c: 0.5 },
    dips: [{ mu: 0.25, depth: 0.2, sigma: 0.06 }, { mu: 0.75, depth: 0.3, sigma: 0.06 }],
    start: 0.08, noise: 1.2, curvature: 50, par: 5
  },
  {
    name: "Bumpy loss",
    tip: "Noise everywhere. Momentum would help. You don't have it.",
    bowl: { a: 1.2, c: 0.5 },
    dips: [
      { mu: 0.15, depth: 0.05, sigma: 0.025 }, { mu: 0.32, depth: 0.06, sigma: 0.025 },
      { mu: 0.5, depth: 0.1, sigma: 0.03 }, { mu: 0.68, depth: 0.06, sigma: 0.025 },
      { mu: 0.85, depth: 0.05, sigma: 0.025 }
    ],
    start: 0.06, noise: 0.8, curvature: 60, par: 4
  },
  {
    name: "Overfit hills",
    tip: "The deepest point hides behind a ridge.",
    bowl: { a: 0.7, c: 0.6 },
    dips: [
      { mu: 0.3, depth: 0.1, sigma: 0.05 }, { mu: 0.55, depth: 0.06, sigma: 0.03 },
      { mu: 0.84, depth: 0.3, sigma: 0.045 }
    ],
    start: 0.08, noise: 0.8, curvature: 80, par: 5
  },
  {
    name: "The final epoch",
    tip: "Everything you learned. Converge.",
    bowl: { a: 1, c: 0.55 },
    dips: [
      { mu: 0.12, depth: 0.1, sigma: 0.03 }, { mu: 0.36, depth: 0.12, sigma: 0.04 },
      { mu: 0.63, depth: 0.22, sigma: 0.04 }, { mu: 0.8, depth: 0.1, sigma: 0.04 }
    ],
    start: 0.92, noise: 0.8, curvature: 120, par: 5
  }
];

// ---- landscape.js ----
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

// ---- descent.js ----
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

// ---- view.js ----
// Screen layout: where the plot, meter, and buttons live for the current size.
// Recomputed every frame from ctx.width/height so rotation and resizes just work.

const THEME = {
  bg: "#0c1015",
  grid: "rgba(255,255,255,0.045)",
  axis: "rgba(255,255,255,0.22)",
  ink: "#eef3ee",
  muted: "rgba(238,243,238,0.58)",
  turfTop: "#2c9a5f",
  turfBottom: "#0f2a1e",
  curve: "#8ff0b4",
  ball: "#ffffff",
  flag: "#ff5d5d",
  danger: "#ff6b6b",
  accent: "#ffd166",
  font: "system-ui, -apple-system, 'Segoe UI', sans-serif"
};

function makeView(ctx, land) {
  const w = ctx.width;
  const h = ctx.height;
  const safe = ctx.safeArea || { top: 0, bottom: 0, left: 0, right: 0 };
  const padX = Math.max(20, safe.left, safe.right) + 4;
  const top = safe.top + 16;

  const plot = {
    x: padX,
    y: top + 118,
    w: w - padX * 2,
    h: Math.max(160, h - safe.bottom - 150 - (top + 118))
  };
  const meter = { x: padX + 8, y: plot.y + plot.h + 58, w: w - padX * 2 - 16, h: 10 };
  const resetButton = { x: w - padX - 84, y: top + 52, w: 84, h: 34 };
  const curveHeight = plot.h * 0.82;

  function toScreen(theta, loss) {
    const sx = plot.x + theta * plot.w;
    const sy = plot.y + plot.h - (loss / land.maxLoss) * curveHeight;
    return { x: sx, y: sy };
  }

  function ballScreen(theta) {
    const clamped = Math.min(1, Math.max(0, theta));
    const p = toScreen(theta, land.loss(clamped));
    return { x: p.x, y: p.y - 7 };
  }

  return { w, h, top, plot, meter, resetButton, toScreen, ballScreen };
}

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ---- render-scene.js ----
// Draws the course itself: graph-paper background, loss curve as turf, flag, ball, trail.

function drawBackground(g, view) {
  g.fillStyle = THEME.bg;
  g.fillRect(0, 0, view.w, view.h);
  g.strokeStyle = THEME.grid;
  g.lineWidth = 1;
  const step = 28;
  g.beginPath();
  for (let x = view.plot.x % step; x < view.w; x += step) { g.moveTo(x, 0); g.lineTo(x, view.h); }
  for (let y = view.plot.y % step; y < view.h; y += step) { g.moveTo(0, y); g.lineTo(view.w, y); }
  g.stroke();
}

function drawAxes(g, view) {
  const { plot } = view;
  g.strokeStyle = THEME.axis;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(plot.x, plot.y - 6);
  g.lineTo(plot.x, plot.y + plot.h);
  g.lineTo(plot.x + plot.w, plot.y + plot.h);
  g.stroke();
  g.fillStyle = THEME.muted;
  g.font = `italic 13px ${THEME.font}`;
  g.textAlign = "left";
  g.fillText("loss", plot.x + 6, plot.y + 8);
  g.textAlign = "right";
  g.fillText("θ", plot.x + plot.w - 2, plot.y + plot.h + 18);
}

function drawCurve(g, view, land) {
  const { plot } = view;
  const pts = land.samples.map(s => view.toScreen(s.x, s.y));
  const turf = g.createLinearGradient(0, plot.y, 0, plot.y + plot.h);
  turf.addColorStop(0, THEME.turfTop);
  turf.addColorStop(1, THEME.turfBottom);

  g.beginPath();
  g.moveTo(pts[0].x, plot.y + plot.h);
  for (const p of pts) g.lineTo(p.x, p.y);
  g.lineTo(pts[pts.length - 1].x, plot.y + plot.h);
  g.closePath();
  g.globalAlpha = 0.55;
  g.fillStyle = turf;
  g.fill();
  g.globalAlpha = 1;

  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.strokeStyle = THEME.curve;
  g.lineWidth = 2.5;
  g.lineJoin = "round";
  g.stroke();
}

function drawFlag(g, view, land, timeMs) {
  const base = view.toScreen(land.xMin, 0);
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.beginPath();
  g.ellipse(base.x, base.y + 1, 11, 4, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = THEME.ink;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(base.x, base.y);
  g.lineTo(base.x, base.y - 46);
  g.stroke();
  const wave = Math.sin(timeMs / 260) * 3;
  g.fillStyle = THEME.flag;
  g.beginPath();
  g.moveTo(base.x, base.y - 46);
  g.quadraticCurveTo(base.x + 13, base.y - 42 + wave, base.x + 24, base.y - 38);
  g.lineTo(base.x, base.y - 30);
  g.closePath();
  g.fill();
}

function drawBall(g, pos, glow) {
  if (glow) {
    g.fillStyle = glow;
    g.beginPath();
    g.arc(pos.x, pos.y, 14, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = THEME.ball;
  g.beginPath();
  g.arc(pos.x, pos.y, 7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(0,0,0,0.18)";
  g.beginPath();
  g.arc(pos.x + 2, pos.y + 2, 3, 0, Math.PI * 2);
  g.fill();
}

function drawTrail(g, view, path, upto) {
  for (let i = 0; i < upto && i < path.length; i++) {
    const p = view.ballScreen(path[i]);
    g.fillStyle = `rgba(255,255,255,${0.12 + 0.5 * (i / Math.max(1, upto))})`;
    g.beginPath();
    g.arc(p.x, p.y + 7, 2.5, 0, Math.PI * 2);
    g.fill();
  }
}

// Ghost of where the very first step lands, so η feels concrete while aiming.
function drawStepPreview(g, view, land, theta, eta, accent) {
  const next = theta - eta * land.grad(theta);
  const from = view.ballScreen(theta);
  const offCourse = next < 0 || next > 1;
  const to = offCourse ? { x: view.plot.x + next * view.plot.w, y: from.y - 70 } : view.ballScreen(next);
  const lift = Math.min(90, 10 + Math.abs(to.x - from.x) * 0.4);
  g.setLineDash([4, 5]);
  g.strokeStyle = offCourse ? THEME.danger : accent;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(from.x, from.y);
  g.quadraticCurveTo((from.x + to.x) / 2, Math.min(from.y, to.y) - lift, to.x, to.y);
  g.stroke();
  g.setLineDash([]);
  g.strokeStyle = offCourse ? THEME.danger : accent;
  g.beginPath();
  g.arc(to.x, to.y, 7, 0, Math.PI * 2);
  g.stroke();
}

// ---- render-hud.js ----
// HUD: hole header, reset button, learning-rate meter, and result panels.

function drawHeader(g, view, state) {
  const level = LEVELS[state.hole];
  const x = view.plot.x;
  g.textAlign = "left";
  g.fillStyle = THEME.muted;
  g.font = `600 12px ${THEME.font}`;
  g.fillText(`HOLE ${state.hole + 1} / ${LEVELS.length}`, x, view.top + 12);
  g.fillStyle = THEME.ink;
  g.font = `700 24px ${THEME.font}`;
  g.fillText(level.name, x, view.top + 40);
  g.fillStyle = THEME.muted;
  g.font = `14px ${THEME.font}`;
  g.fillText(level.tip, x, view.top + 66, view.w - x * 2 - 96);

  g.textAlign = "right";
  g.fillStyle = THEME.ink;
  g.font = `700 22px ${THEME.font}`;
  g.fillText(String(state.strokes[state.hole] || 0), view.w - x, view.top + 40);
  g.fillStyle = THEME.muted;
  g.font = `600 12px ${THEME.font}`;
  g.fillText(`STROKES · PAR ${level.par}`, view.w - x, view.top + 12);
}

function drawResetButton(g, view, enabled) {
  const b = view.resetButton;
  g.globalAlpha = enabled ? 1 : 0.35;
  roundRectPath(g, b.x, b.y, b.w, b.h, 17);
  g.strokeStyle = THEME.axis;
  g.lineWidth = 1;
  g.stroke();
  g.fillStyle = THEME.ink;
  g.font = `600 13px ${THEME.font}`;
  g.textAlign = "center";
  g.fillText("↺ reset +1", b.x + b.w / 2, b.y + b.h / 2 + 5);
  g.globalAlpha = 1;
}

function drawMeter(g, view, land, eta, etaMin, etaMax, accent, active) {
  const m = view.meter;
  const toX = v => m.x + (Math.log(v / etaMin) / Math.log(etaMax / etaMin)) * m.w;
  const critX = Math.min(m.x + m.w, Math.max(m.x, toX(land.criticalEta)));

  roundRectPath(g, m.x, m.y, m.w, m.h, m.h / 2);
  g.fillStyle = "rgba(255,255,255,0.08)";
  g.fill();
  g.save();
  roundRectPath(g, m.x, m.y, m.w, m.h, m.h / 2);
  g.clip();
  g.fillStyle = "rgba(255,107,107,0.28)";
  g.fillRect(critX, m.y, m.x + m.w - critX, m.h);
  g.restore();

  g.textAlign = "left";
  g.font = `600 11px ${THEME.font}`;
  g.fillStyle = THEME.muted;
  g.fillText("crawl", m.x, m.y + 26);
  g.textAlign = "right";
  g.fillStyle = THEME.danger;
  g.fillText("diverge near the hole →", m.x + m.w, m.y + 26);

  if (!active) {
    g.textAlign = "center";
    g.fillStyle = THEME.muted;
    g.font = `600 14px ${THEME.font}`;
    g.fillText("Drag anywhere to set η, release to descend", view.w / 2, m.y - 18);
    return;
  }
  const x = toX(eta);
  g.fillStyle = eta > land.criticalEta ? THEME.danger : accent;
  g.beginPath();
  g.arc(x, m.y + m.h / 2, 9, 0, Math.PI * 2);
  g.fill();
  g.textAlign = "center";
  g.font = `700 22px ${THEME.font}`;
  g.fillText(`η = ${formatEta(eta)}`, view.w / 2, m.y - 16);
}

function drawStatus(g, view, text, color) {
  if (!text) return;
  g.textAlign = "center";
  g.fillStyle = color || THEME.ink;
  g.font = `700 16px ${THEME.font}`;
  g.fillText(text, view.w / 2, view.plot.y - 12);
}

function drawPanel(g, view, title, lines, cta) {
  const w = Math.min(320, view.w - 48);
  const h = 96 + lines.length * 24;
  const x = (view.w - w) / 2;
  const y = view.plot.y + Math.max(8, (view.plot.h - h) / 2 - 30);
  g.fillStyle = "rgba(12,16,21,0.95)";
  roundRectPath(g, x, y, w, h, 18);
  g.fill();
  g.strokeStyle = "rgba(255,255,255,0.14)";
  g.lineWidth = 1;
  g.stroke();
  g.textAlign = "center";
  g.fillStyle = THEME.ink;
  g.font = `800 28px ${THEME.font}`;
  g.fillText(title, view.w / 2, y + 42);
  g.font = `15px ${THEME.font}`;
  g.fillStyle = THEME.muted;
  lines.forEach((line, i) => g.fillText(line, view.w / 2, y + 70 + i * 24));
  g.fillStyle = THEME.accent;
  g.font = `700 14px ${THEME.font}`;
  g.fillText(cta, view.w / 2, y + h - 16);
}

// ---- render-frame.js ----
// Composes one frame from the game snapshot. Pure drawing, no state changes.

function rollingBallPosition(view, shot) {
  const a = shot.path[shot.hop];
  const b = shot.path[Math.min(shot.hop + 1, shot.path.length - 1)];
  const t = ctx2dEaseInOut(Math.min(1, shot.t));
  const theta = a + (b - a) * t;
  const from = view.ballScreen(a);
  const to = view.ballScreen(b);
  const lift = Math.min(90, 8 + Math.abs(to.x - from.x) * 0.35);
  const offCourse = b < 0 || b > 1;
  const pos = view.ballScreen(theta);
  pos.x = view.plot.x + theta * view.plot.w;
  pos.y -= lift * 4 * t * (1 - t) + (offCourse ? 220 * t * t : 0);
  return pos;
}

function ctx2dEaseInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function drawCourseSummary(g, view, summary) {
  const diff = summary.strokes - summary.par;
  const vsPar = diff === 0 ? "Even par" : diff > 0 ? `${diff} over par` : `${-diff} under par`;
  const lines = [`${summary.strokes} strokes · par ${summary.par}`, vsPar];
  if (summary.best) lines.push("New personal best");
  drawPanel(g, view, "Converged!", lines, "Tap to play again");
}

function renderFrame(g, view, s) {
  const { state, scene, aim, shot } = s;
  const land = state.land;

  drawBackground(g, view);
  drawAxes(g, view);
  drawCurve(g, view, land);
  drawFlag(g, view, land, s.clock);

  if (scene === "rolling" && shot) drawTrail(g, view, shot.path, shot.hop + 1);
  else if (s.lastPath && scene === "aim" && !aim) drawTrail(g, view, s.lastPath, s.lastPath.length);

  const aiming = scene === "aim" && aim && aim.dist >= MIN_DRAG_PX;
  if (aiming) drawStepPreview(g, view, land, state.ballX, aim.eta, s.accent);

  if (scene === "rolling" && shot) {
    drawBall(g, rollingBallPosition(view, shot));
  } else {
    const glow = scene === "aim" ? "rgba(255,209,102,0.18)" : null;
    drawBall(g, view.ballScreen(state.ballX), glow);
  }

  drawHeader(g, view, state);
  drawResetButton(g, view, scene === "aim" && state.ballX !== LEVELS[state.hole].start);

  const eta = scene === "rolling" && shot ? shot.eta : aim ? aim.eta : 0;
  drawMeter(g, view, land, eta || s.tune.etaMin(), s.tune.etaMin(), s.tune.etaMax(), s.accent,
    aiming || scene === "rolling");

  if (scene === "rolling" && shot) {
    const step = Math.min(shot.hop + 1, shot.path.length - 1);
    const theta = Math.min(1, Math.max(0, shot.path[step]));
    drawStatus(g, view, `step ${step} · loss ${land.loss(theta).toFixed(3)}`, THEME.muted);
  } else if (s.status) {
    drawStatus(g, view, s.status.text, s.status.color);
  }

  if (scene === "holeDone") {
    const strokes = state.strokes[state.hole];
    const level = LEVELS[state.hole];
    const last = state.hole === LEVELS.length - 1;
    drawPanel(g, view, scoreName(strokes, level.par),
      [`${strokes} stroke${strokes === 1 ? "" : "s"} · par ${level.par}`, `θ* = ${land.xMin.toFixed(3)}`],
      last ? "Tap to see your score" : "Tap for the next hole");
  } else if (scene === "finishing") {
    drawPanel(g, view, "Scoring…", ["Saving your round"], "");
  } else if (scene === "courseDone" && s.summary) {
    drawCourseSummary(g, view, s.summary);
  }
}

// ---- course.js ----
// Course progression: which hole, strokes per hole, and persistence
// (Continue Playing checkpoints + the total-strokes leaderboard).

const PROGRESS_CHANNEL = "course";
const RECORD_CHANNEL = "course_strokes";

function scoreName(strokes, par) {
  if (strokes === 1) return "Hole in one!";
  const diff = strokes - par;
  if (diff <= -2) return "Eagle";
  if (diff === -1) return "Birdie";
  if (diff === 0) return "Par";
  if (diff === 1) return "Bogey";
  if (diff === 2) return "Double bogey";
  return `+${diff}`;
}

function quietly(fn) {
  Promise.resolve().then(fn).catch(() => {});
}

function totalPar() {
  return LEVELS.reduce((sum, level) => sum + level.par, 0);
}

function createCourse(ctx) {
  const score = ctx.game.score({ initial: 0, min: 0 });
  const state = { hole: 0, strokes: LEVELS.map(() => 0), ballX: 0, land: null };

  function loadHole(index) {
    state.hole = index;
    state.land = makeLandscape(LEVELS[index]);
    state.ballX = LEVELS[index].start;
  }

  function addStroke(count = 1) {
    state.strokes[state.hole] += count;
    score.add(count, { reason: "stroke" });
  }

  function total() {
    return state.strokes.reduce((a, b) => a + b, 0);
  }

  function isValidSave(saved) {
    const s = saved && saved.resumeEligible === true ? saved.state : null;
    return Boolean(
      s && Number.isInteger(s.hole) && s.hole > 0 && s.hole < LEVELS.length &&
      Array.isArray(s.strokes) && s.strokes.length === LEVELS.length &&
      s.strokes.every(n => Number.isInteger(n) && n >= 0 && n < 100)
    );
  }

  async function restore() {
    try {
      const saved = await ctx.game.progress.load(PROGRESS_CHANNEL);
      if (!isValidSave(saved)) return false;
      state.strokes = saved.state.strokes.slice();
      score.set(total(), { reason: "resume" });
      loadHole(saved.state.hole);
      return true;
    } catch (err) {
      return false;
    }
  }

  function checkpoint() {
    const payload = {
      state: { hole: state.hole, strokes: state.strokes.slice() },
      label: `Hole ${state.hole + 1} of ${LEVELS.length}`,
      percent: Math.round((state.hole / LEVELS.length) * 100)
    };
    quietly(() => ctx.game.progress.save(PROGRESS_CHANNEL, payload));
  }

  async function finish() {
    const strokes = total();
    const par = totalPar();
    quietly(() => ctx.game.progress.complete(PROGRESS_CHANNEL, {
      state: { hole: LEVELS.length - 1, strokes: state.strokes.slice(), finished: true },
      label: "Course complete",
      percent: 100
    }));
    let best = false;
    try {
      const result = await score.submit(RECORD_CHANNEL, { label: `${strokes} strokes` });
      best = Boolean(result && result.isPersonalBest);
    } catch (err) {
      best = false;
    }
    ctx.platform.complete({ score: strokes, par });
    return { strokes, par, best };
  }

  function restartCourse() {
    quietly(() => ctx.game.progress.abandon(PROGRESS_CHANNEL));
    state.strokes = LEVELS.map(() => 0);
    score.reset({ reason: "replay" });
    loadHole(0);
  }

  loadHole(0);
  return { state, loadHole, addStroke, total, restore, checkpoint, finish, restartCourse };
}

// ---- feedback.js ----
// Sound, haptics, and visual pops. Everything here is best-effort: a missing
// capability or a locked audio context should never break gameplay.

function createFeedback(ctx) {
  let music = null;

  function safe(fn) {
    try {
      const result = fn();
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch (err) {
      // Feedback is optional; ignore host capability errors.
    }
  }

  function haptic(kind) {
    if (ctx.capabilities && ctx.capabilities.haptics) safe(() => ctx.platform.haptic(kind));
  }

  function sting(name) {
    if (music) safe(() => ctx.music.sting(name));
  }

  async function unlockMusic() {
    if (music || !(ctx.capabilities && ctx.capabilities.backgroundMusic)) return;
    try {
      await ctx.music.unlock();
      music = ctx.music.play({ preset: "lofi", volume: ctx.tune.percent("music_volume") ?? 0.3, fadeInMs: 1200 });
    } catch (err) {
      music = null;
    }
  }

  ctx.tune.onChange("music_volume", () => {
    if (music) safe(() => music.setVolume(ctx.tune.percent("music_volume")));
  });

  return {
    unlockMusic,
    shoot() {
      haptic("light");
    },
    sunk(pos, label) {
      haptic("success");
      sting("coin");
      safe(() => ctx.fx.burst({ x: pos.x, y: pos.y, color: THEME.accent, count: 18 }));
      safe(() => ctx.fx.floatText({ text: label, x: pos.x, y: pos.y - 40, color: THEME.accent, size: 22 }));
    },
    exploded(pos) {
      haptic("error");
      sting("fail");
      safe(() => ctx.fx.flash({ color: THEME.danger, opacity: 0.22 }));
      safe(() => ctx.fx.floatText({ text: "∇ exploded", x: pos.x, y: pos.y, color: THEME.danger }));
    },
    stuck(pos, text) {
      haptic("warning");
      safe(() => ctx.fx.ripple({ x: pos.x, y: pos.y, color: THEME.muted }));
      safe(() => ctx.fx.floatText({ text, x: pos.x, y: pos.y - 24, color: THEME.ink, size: 15 }));
    },
    courseDone() {
      haptic("success");
      sting("win");
    }
  };
}

// ---- game.js ----
// Game flow: aim (drag sets η) → rolling (animate descent hops) → hole done → course done.

const MIN_DRAG_PX = 14;

const OUTCOME_TEXT = {
  stuck: "Stuck in a local minimum. Try a bigger η.",
  rattling: "Bouncing around the hole. Lower η.",
  stopped: "Out of steps. Still descending…",
  exploded: "Exploded! +1 penalty. Lower η."
};

function createGame(ctx, canvas, input, feedback) {
  const course = createCourse(ctx);
  const state = course.state;
  const g = canvas.getContext("2d");
  let scene = "aim";
  let aim = null;
  let shot = null;
  let lastPath = null;
  let status = null;
  let sceneAt = 0;
  let summary = null;
  let started = false;
  let clock = 0;

  const tune = {
    etaMin: () => ctx.tune.number("eta_min") ?? 0.0005,
    etaMax: () => ctx.tune.number("eta_max") ?? 0.6,
    maxSteps: () => ctx.tune.integer("max_steps") ?? 30,
    hopMs: () => ctx.tune.durationMs("hop_ms") ?? 110,
    accent: () => ctx.tune.color("accent_color") || THEME.accent
  };

  function setScene(next) { scene = next; sceneAt = clock; }
  function say(text, color) { status = { text, color, until: clock + 3200 }; }

  function begin() {
    if (started) return;
    started = true;
    ctx.platform.start();
    feedback.unlockMusic();
  }

  function onAimInput(view) {
    if (input.pressed) {
      begin();
      if (ctx.input.hitRect(input, view.resetButton.x, view.resetButton.y, view.resetButton.w, view.resetButton.h)) {
        if (state.ballX !== LEVELS[state.hole].start) {
          course.addStroke(1);
          state.ballX = LEVELS[state.hole].start;
          lastPath = null;
          say("Back to the tee. +1 stroke.");
          ctx.platform.interact({ type: "reset_hole" });
        }
        return;
      }
      aim = { sx: input.x, sy: input.y, dist: 0, eta: tune.etaMin() };
    }
    if (!aim) return;
    aim.dist = Math.hypot(input.x - aim.sx, input.y - aim.sy);
    aim.eta = etaFromDrag(aim.dist, Math.min(view.w, view.h) * 0.6, tune.etaMin(), tune.etaMax());
    if (input.released) {
      if (aim.dist >= MIN_DRAG_PX) shoot(aim.eta);
      aim = null;
    }
  }

  function shoot(eta) {
    const seed = strokeSeed(state.hole, state.strokes[state.hole]);
    shot = { ...planStroke(state.land, state.ballX, eta, tune.maxSteps(), seed), hop: 0, t: 0, eta };
    course.addStroke(1);
    status = null;
    feedback.shoot();
    ctx.platform.interact({ type: "stroke", eta, hole: state.hole + 1 });
    setScene("rolling");
  }

  function resolveShot(view) {
    lastPath = shot.path;
    const endPos = view.ballScreen(shot.path[shot.path.length - 1]);
    if (shot.outcome === "sunk") {
      state.ballX = state.land.xMin;
      const strokes = state.strokes[state.hole];
      feedback.sunk(view.ballScreen(state.ballX), scoreName(strokes, LEVELS[state.hole].par));
      ctx.platform.milestone("hole_complete", { hole: state.hole + 1, strokes });
      setScene("holeDone");
      return;
    }
    if (shot.outcome === "exploded") {
      course.addStroke(1);
      feedback.exploded({ x: Math.min(view.w - 60, Math.max(60, endPos.x)), y: view.plot.y + 40 });
      say(OUTCOME_TEXT.exploded, THEME.danger);
    } else {
      state.ballX = shot.end;
      if (shot.outcome === "stuck") feedback.stuck(endPos, "local min");
      say(OUTCOME_TEXT[shot.outcome]);
    }
    setScene("aim");
  }

  // Big hops take the full step time; tiny creeping steps zip by.
  function hopDuration(view) {
    const a = shot.path[shot.hop];
    const b = shot.path[Math.min(shot.hop + 1, shot.path.length - 1)];
    const px = Math.abs(b - a) * view.plot.w;
    return Math.max(28, Math.min(1.3, 0.25 + px / 40) * tune.hopMs());
  }

  function onRolling(dt, view) {
    shot.t += dt / hopDuration(view);
    while (shot.t >= 1 && scene === "rolling") {
      shot.t -= 1;
      shot.hop += 1;
      if (shot.hop >= shot.path.length - 1) resolveShot(view);
    }
  }

  function onPanelTap() {
    if (!input.released || clock - sceneAt < 600) return;
    if (scene === "holeDone") {
      lastPath = null;
      if (state.hole < LEVELS.length - 1) {
        course.loadHole(state.hole + 1);
        course.checkpoint();
        setScene("aim");
      } else {
        setScene("finishing");
        course.finish().then(result => {
          summary = result;
          setScene("courseDone");
          feedback.courseDone();
          ctx.timeout(() => ctx.pulse.complete({ score: result.strokes, text: `${result.strokes} strokes · par ${result.par}` }), 250);
        });
      }
    } else if (scene === "courseDone") {
      summary = null;
      lastPath = null;
      course.restartCourse();
      ctx.platform.interact({ type: "replay" });
      setScene("aim");
    }
  }

  function update(dt) {
    clock += dt;
    const view = makeView(ctx, state.land);
    if (scene === "aim") onAimInput(view);
    else if (scene === "rolling") onRolling(dt, view);
    else onPanelTap();
    if (status && clock > status.until) status = null;
  }

  function render() {
    const view = makeView(ctx, state.land);
    const accent = tune.accent();
    renderFrame(g, view, { state, scene, aim, shot, lastPath, status, summary, clock, accent, tune });
  }

  return { update, render, restore: course.restore };
}

// ---- main.js ----
// Entry point: mount the canvas, wire input + loop, restore a saved round, go.

window.plethoraBit = {
  async init(ctx) {
    const canvas = ctx.createCanvas2D({ layer: "content", alpha: false, maxDpr: 2, coordinateSpace: "css" });
    const input = ctx.input.track(canvas);
    const feedback = createFeedback(ctx);
    const game = createGame(ctx, canvas, input, feedback);

    game.render();
    ctx.markVisualReady("course drawn");

    await game.restore();

    ctx.game.loop({
      input,
      update: dt => game.update(dt),
      render: () => game.render()
    });
    ctx.platform.ready();
  }
};

})();
