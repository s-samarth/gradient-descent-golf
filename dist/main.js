(function () {
"use strict";

// ---- runtime.js ----
// Compatibility shell over the Plethora `ctx`.
// The installed Plethora app can run an older runtime than the published SDK docs
// (e.g. no ctx.input). Every helper here prefers the documented ctx API and falls
// back to plain browser APIs, so the game never depends on one runtime version.

function isFn(value) {
  return typeof value === "function";
}

function safeCall(fn, fallback) {
  try {
    const result = fn();
    if (result && typeof result.catch === "function") result.catch(() => {});
    return result;
  } catch (err) {
    return fallback;
  }
}

function createShell(ctx) {
  const cleanups = [];
  const container = ctx.container || null; // read-only; only used for sizing
  if (typeof ctx.onDestroy === "function") ctx.onDestroy(() => cleanups.splice(0).forEach(fn => safeCall(fn)));

  function width() {
    return ctx.width || (container && container.clientWidth) || window.innerWidth;
  }
  function height() {
    return ctx.height || (container && container.clientHeight) || window.innerHeight;
  }
  function safeArea() {
    const s = ctx.safeArea || {};
    return { top: s.top || 0, bottom: s.bottom || 0, left: s.left || 0, right: s.right || 0 };
  }

  function listen(target, type, handler, options) {
    if (typeof ctx.listen === "function") return ctx.listen(target, type, handler, options);
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
    return () => target.removeEventListener(type, handler, options);
  }

  function createCanvas() {
    let canvas = null;
    if (typeof ctx.createCanvas2D === "function") canvas = safeCall(() => ctx.createCanvas2D(), null);
    if (!canvas && typeof ctx.createCanvas === "function") canvas = safeCall(() => ctx.createCanvas(), null);
    if (!canvas) throw new Error("This runtime has no ctx.createCanvas2D or ctx.createCanvas");
    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.touchAction = "none";
    return canvas;
  }

  // We own the backing store: size it to CSS size × DPR and draw in CSS pixels.
  function prepareCanvas(canvas, g) {
    const w = width();
    const h = height();
    const dpr = Math.min(window.devicePixelRatio || ctx.dpr || 1, 2);
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Minimal pointer tracker with one-frame pressed/released flags.
  function trackPointer(canvas) {
    const state = { x: 0, y: 0, down: false, pressed: false, released: false, id: null };
    const locate = e => {
      const rect = canvas.getBoundingClientRect();
      state.x = e.clientX - rect.left;
      state.y = e.clientY - rect.top;
    };
    listen(canvas, "pointerdown", e => {
      if (state.down) return;
      e.preventDefault();
      state.id = e.pointerId;
      safeCall(() => canvas.setPointerCapture(e.pointerId));
      locate(e);
      state.down = true;
      state.pressed = true;
    });
    listen(canvas, "pointermove", e => {
      if (state.down && e.pointerId === state.id) { e.preventDefault(); locate(e); }
    });
    const end = e => {
      if (!state.down || e.pointerId !== state.id) return;
      locate(e);
      state.down = false;
      state.released = true;
    };
    listen(canvas, "pointerup", end);
    listen(canvas, "pointercancel", end);
    state.frameDone = () => { state.pressed = false; state.released = false; };
    return state;
  }

  // Frame loop: ctx.game.loop → ctx.onFrame → ctx.raf → ctx.interval.
  // Plethora rejects uploads that touch the browser's own frame scheduler, so no raw fallback.
  function loop(frame) {
    let last = performance.now();
    // Prefer the runtime's dt (it pauses with the host); fall back to wall-clock time.
    const tick = hostDt => {
      const now = performance.now();
      const measured = now - last;
      last = now;
      const dt = Number.isFinite(hostDt) && hostDt > 0 ? hostDt : measured;
      frame(Math.min(50, Math.max(0, dt)));
    };
    if (ctx.game && isFn(ctx.game.loop) && safeCall(() => ctx.game.loop({ update: dt => tick(dt) }), false) !== false) return;
    if (typeof ctx.onFrame === "function" && safeCall(() => ctx.onFrame(dt => tick(dt)), false) !== false) return;
    if (typeof ctx.raf === "function" && safeCall(() => ctx.raf(dt => tick(dt)), false) !== false) return;
    if (typeof ctx.interval === "function") ctx.interval(() => tick(), 16);
  }

  function timeout(fn, ms) {
    if (typeof ctx.timeout === "function") return ctx.timeout(fn, ms);
    const id = setTimeout(fn, ms);
    cleanups.push(() => clearTimeout(id));
    return id;
  }

  return { width, height, safeArea, createCanvas, prepareCanvas, trackPointer, loop, timeout };
}

function hitRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

// ---- services.js ----
// Optional Plethora services (tuning, score, progress, platform events, fx, music),
// each wrapped so a missing or older API degrades to a no-op instead of crashing.

const TUNING_DEFAULTS = {
  eta_min: 0.0005,
  eta_max: 0.6,
  max_steps: 40,
  hop_ms: 110,
  accent_color: "#ffd166",
  music_volume: 0.3
};

function createServices(ctx) {
  function tune(id) {
    const t = ctx.tune;
    const value = t && typeof t.get === "function" ? safeCall(() => t.get(id), undefined) : undefined;
    return value === undefined || value === null ? TUNING_DEFAULTS[id] : value;
  }

  function onTuneChange(id, fn) {
    if (ctx.tune && isFn(ctx.tune.onChange)) safeCall(() => ctx.tune.onChange(id, fn));
  }

  // No computed lookups (obj[name]) on anything derived from ctx: Plethora's upload
  // scanner treats them as dynamic loader access and rejects the Bit.
  const p = ctx.platform || {};
  const platformFns = new Map([
    ["ready", p.ready], ["start", p.start], ["interact", p.interact], ["milestone", p.milestone],
    ["complete", p.complete], ["haptic", p.haptic], ["setScore", p.setScore]
  ]);
  function platform(name, ...args) {
    const fn = platformFns.get(name);
    if (isFn(fn)) safeCall(() => fn.apply(p, args));
  }

  const f = ctx.fx || {};
  const fxFns = new Map([["burst", f.burst], ["floatText", f.floatText], ["flash", f.flash], ["ripple", f.ripple]]);
  function fx(name, options) {
    const fn = fxFns.get(name);
    if (isFn(fn)) safeCall(() => fn.call(f, options));
  }

  const caps = ctx.capabilities || null;
  const capabilityFlags = new Map(caps ? [["haptics", caps.haptics], ["backgroundMusic", caps.backgroundMusic]] : []);
  function capability(name) {
    return !caps || capabilityFlags.get(name) !== false;
  }

  function createScore() {
    const native = ctx.game && isFn(ctx.game.score) ? safeCall(() => ctx.game.score({ initial: 0, min: 0 }), null) : null;
    let local = 0;
    const sync = nativeCall => {
      if (native) safeCall(nativeCall);
      else platform("setScore", local);
    };
    return {
      get value() { return local; },
      add(n, opts) { local += n; sync(() => native.add(n, opts)); },
      set(n, opts) { local = n; sync(() => native.set(n, opts)); },
      reset(opts) { local = 0; sync(() => native.reset(opts)); },
      async submit(channel, options) {
        try {
          if (native && typeof native.submit === "function") return await native.submit(channel, options);
          if (ctx.memory && isFn(ctx.memory.record)) return await ctx.memory.record(channel).submit(local, options);
        } catch (err) {
          return null;
        }
        return null;
      }
    };
  }

  const progressApi = () => (ctx.game && ctx.game.progress ? ctx.game.progress : null);
  const progress = {
    async load(channel) {
      const api = progressApi();
      if (!api || typeof api.load !== "function") return null;
      try { return await api.load(channel); } catch (err) { return null; }
    },
    save(channel, payload) {
      const api = progressApi();
      if (api && typeof api.save === "function") safeCall(() => api.save(channel, payload));
    },
    complete(channel, payload) {
      const api = progressApi();
      if (api && typeof api.complete === "function") safeCall(() => api.complete(channel, payload));
    },
    abandon(channel) {
      const api = progressApi();
      if (api && typeof api.abandon === "function") safeCall(() => api.abandon(channel));
    }
  };

  function pulseComplete(options) {
    if (ctx.pulse && isFn(ctx.pulse.complete)) safeCall(() => ctx.pulse.complete(options));
    else platform("complete", { ...options, pulse: true });
  }

  const music = {
    async start(volume) {
      if (!ctx.music || !capability("backgroundMusic")) return null;
      try {
        if (typeof ctx.music.unlock === "function") await ctx.music.unlock();
        if (typeof ctx.music.play !== "function") return null;
        return ctx.music.play({ preset: "lofi", volume, fadeInMs: 1200 }) || null;
      } catch (err) {
        return null;
      }
    },
    sting(name) {
      if (ctx.music && typeof ctx.music.sting === "function") safeCall(() => ctx.music.sting(name));
    }
  };

  function markReady() {
    if (typeof ctx.markVisualReady === "function") safeCall(() => ctx.markVisualReady("course drawn"));
    platform("ready");
  }

  return { tune, onTuneChange, platform, fx, capability, createScore, progress, pulseComplete, music, markReady };
}

// ---- diagnostics.js ----
// If anything fails at startup or mid-frame, show the error plus what this
// runtime actually provides, instead of a blank screen. A screenshot of this
// is enough to diagnose runtime mismatches.

function describeRuntime(ctx) {
  const lines = [];
  const runtime = ctx && ctx.runtime ? `${ctx.runtime.version || "?"} sdk ${ctx.runtime.sdkVersion || "?"}` : "no ctx.runtime";
  lines.push(runtime);
  if (!ctx) return lines;
  const keys = Object.keys(ctx).sort();
  lines.push(`ctx: ${keys.join(", ")}`);
  const groups = { input: ctx.input, game: ctx.game, platform: ctx.platform, tune: ctx.tune, fx: ctx.fx, music: ctx.music };
  for (const [group, value] of Object.entries(groups)) {
    lines.push(`${group}: ${value && typeof value === "object" ? Object.keys(value).join(", ") || "{}" : String(value)}`);
  }
  return lines;
}

function showFailure(ctx, canvas, err, stage) {
  const message = `${stage}: ${err && err.message ? err.message : String(err)}`;
  const lines = [message, ...describeRuntime(ctx)];
  try {
    if (ctx && ctx.platform && typeof ctx.platform.error === "function") ctx.platform.error({ message, stage });
  } catch (ignored) {
    // Reporting is best-effort.
  }

  if (!canvas && ctx && typeof ctx.createCanvas2D === "function") {
    try { canvas = ctx.createCanvas2D(); } catch (ignored) { canvas = null; }
  }
  if (!canvas && ctx && typeof ctx.createRoot === "function") {
    try {
      const root = ctx.createRoot({ style: "padding:60px 20px;color:#eee;background:#0c1015;font:12px monospace;white-space:pre-wrap" });
      root.textContent = lines.join("\n\n");
    } catch (ignored) {
      // Nothing else we can do.
    }
    return;
  }
  const g = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  if (!g) return;
  const w = canvas.clientWidth || 360;
  const h = canvas.clientHeight || 640;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = "#0c1015";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#ff6b6b";
  g.font = "700 16px system-ui, sans-serif";
  g.fillText("Gradient Descent Golf hit an error", 20, 70);
  g.font = "12px ui-monospace, Menlo, monospace";
  let y = 100;
  for (const line of lines) {
    for (const chunk of wrapText(g, line, w - 40)) {
      g.fillStyle = y === 100 ? "#ffd166" : "rgba(238,243,238,0.75)";
      g.fillText(chunk, 20, y);
      y += 17;
      if (y > h - 40) return;
    }
    y += 6;
  }
}

function wrapText(g, text, maxWidth) {
  const out = [];
  let line = "";
  for (const word of String(text).split(/(\s+|,)/)) {
    if (g.measureText(line + word).width > maxWidth && line) {
      out.push(line);
      line = word.trimStart();
    } else {
      line += word;
    }
  }
  if (line) out.push(line);
  return out;
}

// ---- levels.js ----
// Nine holes. bowl = a·(θ − c)², dips = Gaussian valleys, curvature = f''
// at the global minimum (critical η = 2 / curvature). momentum = β, how much speed the ball keeps between steps. Check with tools/solve.mjs.

const LEVELS = [
  {
    name: "Convex warmup",
    tip: "Each hop = η × slope. Steep ground, big hop.",
    bowl: { a: 1, c: 0.62 }, dips: [], start: 0.06, momentum: 0, curvature: 30, par: 2
  },
  {
    name: "Steep bowl",
    tip: "Walls this steep turn a big η into a ping-pong.",
    bowl: { a: 1, c: 0.4 }, dips: [], start: 0.94, momentum: 0, curvature: 140, par: 2
  },
  {
    name: "Local trap",
    tip: "Momentum on: the ball keeps its speed over small dips.",
    bowl: { a: 1.4, c: 0.6 },
    dips: [{ mu: 0.28, depth: 0.22, sigma: 0.045 }, { mu: 0.72, depth: 0.12, sigma: 0.05 }],
    start: 0.16, momentum: 0.9, curvature: 40, par: 3
  },
  {
    name: "The plateau",
    tip: "Flat ground means tiny slope. Momentum builds speed.",
    bowl: { a: 0.15, c: 0.9 },
    dips: [{ mu: 0.82, depth: 0.2, sigma: 0.06 }],
    start: 0.08, momentum: 0.8, curvature: 45, par: 3
  },
  {
    name: "Narrow minimum",
    tip: "Sharp hole. Too much η and you hop right over it.",
    bowl: { a: 0.9, c: 0.52 },
    dips: [{ mu: 0.52, depth: 0.08, sigma: 0.018 }],
    start: 0.84, momentum: 0.9, curvature: 160, par: 2
  },
  {
    name: "Twin valleys",
    tip: "Roll through the first valley into the deeper one.",
    bowl: { a: 1.8, c: 0.5 },
    dips: [{ mu: 0.3, depth: 0.15, sigma: 0.06 }, { mu: 0.7, depth: 0.25, sigma: 0.07 }],
    start: 0.04, momentum: 0.7, curvature: 50, par: 5
  },
  {
    name: "Bumpy loss",
    tip: "Less momentum now. Too small an η stalls in a dip.",
    bowl: { a: 1.2, c: 0.5 },
    dips: [
      { mu: 0.15, depth: 0.05, sigma: 0.025 }, { mu: 0.32, depth: 0.06, sigma: 0.025 },
      { mu: 0.5, depth: 0.1, sigma: 0.03 }, { mu: 0.68, depth: 0.06, sigma: 0.025 },
      { mu: 0.85, depth: 0.05, sigma: 0.025 }
    ],
    start: 0.06, momentum: 0.6, curvature: 60, par: 5
  },
  {
    name: "Overfit hills",
    tip: "Two traps on the way down. Keep your speed up.",
    bowl: { a: 2.6, c: 0.7 },
    dips: [
      { mu: 0.28, depth: 0.1, sigma: 0.04 }, { mu: 0.5, depth: 0.1, sigma: 0.03 },
      { mu: 0.74, depth: 0.2, sigma: 0.04 }
    ],
    start: 0.1, momentum: 0.6, curvature: 80, par: 4
  },
  {
    name: "The final epoch",
    tip: "Par 3. Everything you learned. Converge.",
    bowl: { a: 1, c: 0.55 },
    dips: [
      { mu: 0.12, depth: 0.1, sigma: 0.03 }, { mu: 0.36, depth: 0.12, sigma: 0.04 },
      { mu: 0.63, depth: 0.22, sigma: 0.04 }, { mu: 0.8, depth: 0.1, sigma: 0.04 }
    ],
    start: 0.92, momentum: 0.8, curvature: 120, par: 3
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

// ---- view.js ----
// Screen layout: where the plot, meter, and buttons live for the current size.
// Recomputed every frame from the shell's size so rotation and resizes just work.

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

function makeView(shell, land) {
  const w = shell.width();
  const h = shell.height();
  const safe = shell.safeArea();
  const padX = Math.max(20, safe.left, safe.right) + 4;
  const top = safe.top + 16;

  const plot = {
    x: padX,
    y: top + 136,
    w: w - padX * 2,
    h: Math.max(160, h - safe.bottom - 150 - (top + 136))
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

// ---- render-hud.js ----
// HUD: hole header, reset button, status line, and result panels.

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

// pulseClock: pass the game clock to make the button glow (used when reset is the only way out).
function drawResetButton(g, view, enabled, pulseClock) {
  const b = view.resetButton;
  g.globalAlpha = enabled ? 1 : 0.35;
  roundRectPath(g, b.x, b.y, b.w, b.h, 17);
  if (pulseClock !== null && pulseClock !== undefined && enabled) {
    g.fillStyle = `rgba(255,209,102,${0.18 + 0.14 * Math.sin(pulseClock / 180)})`;
    g.fill();
    g.strokeStyle = THEME.accent;
    g.lineWidth = 2;
  } else {
    g.strokeStyle = THEME.axis;
    g.lineWidth = 1;
  }
  g.stroke();
  g.fillStyle = THEME.ink;
  g.font = `600 13px ${THEME.font}`;
  g.textAlign = "center";
  g.fillText("↺ reset +1", b.x + b.w / 2, b.y + b.h / 2 + 5);
  g.globalAlpha = 1;
}

function drawStatus(g, view, text, color) {
  if (!text) return;
  g.textAlign = "center";
  g.fillStyle = color || THEME.ink;
  g.font = `700 15px ${THEME.font}`;
  const lines = wrapText(g, text, view.w - 32).slice(0, 2);
  const bottom = view.plot.y - 10;
  lines.forEach((line, i) => g.fillText(line.trim(), view.w / 2, bottom - (lines.length - 1 - i) * 19));
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

// ---- render-guides.js ----
// Aim guides that make the math visible: the slope under the ball, ghost dots for
// the next few hops, the live "hop = η × slope" readout, and a meter colored by
// what each η would do from where the ball is right now.

const BAND_COLORS = {
  crawl: "rgba(238,243,238,0.28)",
  smooth: "#5fd39a",
  bouncy: "#ffd166",
  overshoot: "#ff9f5a",
  explode: "#ff6b6b"
};

const METER_SAMPLES = 48;

function computeMeterBands(land, theta, momentum, etaMin, etaMax) {
  const bands = [];
  for (let i = 0; i <= METER_SAMPLES; i++) {
    const eta = etaFromDrag(i, METER_SAMPLES, etaMin, etaMax);
    bands.push(classifyShot(land, theta, eta, momentum));
  }
  return bands;
}

// Arrow along the ground pointing downhill; longer arrow = steeper slope = bigger hop.
function drawSlopeLine(g, view, land, theta) {
  const pos = view.ballScreen(theta);
  const slope = land.grad(theta);
  if (Math.abs(slope) < 0.05) {
    g.fillStyle = THEME.accent;
    g.font = `700 12px ${THEME.font}`;
    g.textAlign = "center";
    g.fillText("flat here · slope 0", Math.min(view.w - 70, Math.max(70, pos.x)), pos.y - 22);
    return;
  }
  const h = 0.002;
  const a = view.toScreen(theta - h, land.loss(Math.max(0, theta - h)));
  const b = view.toScreen(theta + h, land.loss(Math.min(1, theta + h)));
  let angle = Math.atan2(b.y - a.y, b.x - a.x);
  if (slope > 0) angle += Math.PI; // point toward lower loss
  const len = 22 + Math.min(1, Math.abs(slope) / 20) * 48;
  const baseX = pos.x;
  const baseY = pos.y - 16;
  const tipX = baseX + Math.cos(angle) * len;
  const tipY = baseY + Math.sin(angle) * len;
  g.strokeStyle = THEME.accent;
  g.fillStyle = THEME.accent;
  g.lineWidth = 3;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(baseX, baseY);
  g.lineTo(tipX, tipY);
  g.stroke();
  g.beginPath();
  g.moveTo(tipX + Math.cos(angle) * 6, tipY + Math.sin(angle) * 6);
  g.lineTo(tipX + Math.cos(angle + 2.4) * 9, tipY + Math.sin(angle + 2.4) * 9);
  g.lineTo(tipX + Math.cos(angle - 2.4) * 9, tipY + Math.sin(angle - 2.4) * 9);
  g.closePath();
  g.fill();
  g.lineCap = "butt";
  g.font = `700 12px ${THEME.font}`;
  g.textAlign = "center";
  const label = `downhill · slope ${Math.abs(slope).toFixed(1)}`;
  const half = g.measureText(label).width / 2 + 8;
  const labelX = Math.min(view.w - half, Math.max(half, baseX));
  g.fillText(label, labelX, baseY - 14);
}

function drawGhostHops(g, view, land, theta, eta, momentum, count = 4) {
  let x = theta;
  let v = 0;
  let from = view.ballScreen(x);
  for (let i = 1; i <= count; i++) {
    ({ x, v } = descentStep(land, x, v, eta, momentum));
    const off = !Number.isFinite(x) || x < 0 || x > 1;
    const to = off
      ? { x: view.plot.x + Math.min(1.1, Math.max(-0.1, x || 0)) * view.plot.w, y: view.plot.y - 10 }
      : view.ballScreen(x);
    const lift = Math.min(90, 8 + Math.abs(to.x - from.x) * 0.35);
    const alpha = 1 - (i - 1) * 0.2;
    g.globalAlpha = alpha;
    g.setLineDash([4, 5]);
    g.strokeStyle = off ? THEME.danger : "rgba(255,255,255,0.7)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(from.x, from.y);
    g.quadraticCurveTo((from.x + to.x) / 2, Math.min(from.y, to.y) - lift, to.x, to.y);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = off ? THEME.danger : "rgba(255,255,255,0.85)";
    g.beginPath();
    g.arc(to.x, to.y, 4.5, 0, Math.PI * 2);
    g.fill();
    g.font = `700 10px ${THEME.font}`;
    g.textAlign = "center";
    g.fillText(String(i), to.x, to.y - 9);
    g.globalAlpha = 1;
    if (off) break;
    from = to;
  }
}

function drawEquation(g, view, land, theta, eta, momentum) {
  const slope = land.grad(theta);
  const hop = eta * slope;
  const m = view.meter;
  g.textAlign = "center";
  g.font = `600 13px ${THEME.font}`;
  g.fillStyle = THEME.ink;
  const base = `first hop = η × slope = ${formatEta(eta)} × ${Math.abs(slope).toFixed(1)} = ${Math.abs(hop).toFixed(3)}`;
  g.fillText(base, view.w / 2, m.y + 44, view.w - 24);
  const theta2 = theta - hop;
  if (theta2 < 0 || theta2 > 1) {
    g.fillStyle = THEME.danger;
    g.font = `600 12px ${THEME.font}`;
    g.fillText("That first hop is longer than the whole course (width 1.0)", view.w / 2, m.y + 62, view.w - 24);
  } else if (momentum > 0) {
    g.fillStyle = THEME.muted;
    g.font = `12px ${THEME.font}`;
    g.fillText(`then momentum β = ${momentum} keeps ${Math.round(momentum * 100)}% of the speed each hop`, view.w / 2, m.y + 62, view.w - 24);
  }
}

function drawMeter(g, view, bands, eta, etaMin, etaMax, active) {
  const m = view.meter;
  const segW = m.w / bands.length;
  g.save();
  roundRectPath(g, m.x, m.y, m.w, m.h, m.h / 2);
  g.clip();
  bands.forEach((kind, i) => {
    g.fillStyle = BAND_COLORS[kind] || BAND_COLORS.crawl;
    g.fillRect(m.x + i * segW, m.y, segW + 0.5, m.h);
  });
  g.restore();

  if (!active) {
    g.textAlign = "center";
    g.fillStyle = THEME.muted;
    g.font = `600 14px ${THEME.font}`;
    g.fillText("Drag anywhere to set η, release to descend", view.w / 2, m.y - 16);
    drawMeterLegend(g, view);
    return;
  }
  const t = Math.min(1, Math.max(0, etaToFraction(eta, etaMin, etaMax)));
  const kind = bands[Math.round(t * (bands.length - 1))];
  const x = m.x + t * m.w;
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.arc(x, m.y + m.h / 2, 9, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = BAND_COLORS[kind] || THEME.ink;
  g.beginPath();
  g.arc(x, m.y + m.h / 2, 5, 0, Math.PI * 2);
  g.fill();
  g.textAlign = "center";
  g.font = `700 20px ${THEME.font}`;
  g.fillText(`η = ${formatEta(eta)} · ${METER_LABELS[kind] || kind}`, view.w / 2, m.y - 14);
}

const METER_LABELS = {
  crawl: "barely moves",
  smooth: "smooth",
  bouncy: "bouncy",
  overshoot: "overshooting",
  explode: "flies off"
};

function drawMeterLegend(g, view) {
  const items = [["crawl", "stuck"], ["smooth", "smooth"], ["bouncy", "bouncy"], ["overshoot", "overshoot"], ["explode", "flies off"]];
  const y = view.meter.y + 28;
  const step = Math.min(80, (view.w - 24) / items.length);
  let x = view.w / 2 - (step * items.length) / 2 + 6;
  g.font = `600 11px ${THEME.font}`;
  g.textAlign = "left";
  for (const [kind, label] of items) {
    g.fillStyle = BAND_COLORS[kind];
    g.beginPath();
    g.arc(x, y - 4, 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = THEME.muted;
    g.fillText(label, x + 8, y);
    x += step;
  }
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
  const momentum = LEVELS[state.hole].momentum;
  if (scene === "aim") drawSlopeLine(g, view, land, state.ballX);
  if (aiming) drawGhostHops(g, view, land, state.ballX, aim.eta, momentum);

  if (scene === "rolling" && shot) {
    drawBall(g, rollingBallPosition(view, shot));
  } else {
    const glow = scene === "aim" ? "rgba(255,209,102,0.18)" : null;
    drawBall(g, view.ballScreen(state.ballX), glow);
  }

  drawHeader(g, view, state);
  drawResetButton(g, view, scene === "aim" && state.ballX !== LEVELS[state.hole].start, s.suggestReset ? s.clock : null);

  const eta = scene === "rolling" && shot ? shot.eta : aim ? aim.eta : s.tune.etaMin();
  const showAim = aiming || scene === "rolling";
  drawMeter(g, view, s.bands, eta, s.tune.etaMin(), s.tune.etaMax(), showAim);
  if (aiming) drawEquation(g, view, land, state.ballX, aim.eta, momentum);

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

function totalPar() {
  return LEVELS.reduce((sum, level) => sum + level.par, 0);
}

function createCourse(services) {
  const score = services.createScore();
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
      const saved = await services.progress.load(PROGRESS_CHANNEL);
      // Never yank a player to another hole if they already started playing.
      if (!isValidSave(saved) || total() > 0 || state.hole !== 0) return false;
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
    services.progress.save(PROGRESS_CHANNEL, payload);
  }

  async function finish() {
    const strokes = total();
    const par = totalPar();
    services.progress.complete(PROGRESS_CHANNEL, {
      state: { hole: LEVELS.length - 1, strokes: state.strokes.slice(), finished: true },
      label: "Course complete",
      percent: 100
    });
    let best = false;
    try {
      const result = await score.submit(RECORD_CHANNEL, { label: `${strokes} strokes` });
      best = Boolean(result && result.isPersonalBest);
    } catch (err) {
      best = false;
    }
    services.platform("complete", { score: strokes, par });
    return { strokes, par, best };
  }

  function restartCourse() {
    services.progress.abandon(PROGRESS_CHANNEL);
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

function createFeedback(services) {
  let music = null;
  let musicStarting = false;

  function haptic(kind) {
    if (services.capability("haptics")) services.platform("haptic", kind);
  }

  async function unlockMusic() {
    if (music || musicStarting) return;
    musicStarting = true;
    music = await services.music.start(services.tune("music_volume"));
    musicStarting = false;
  }

  services.onTuneChange("music_volume", () => {
    if (music && typeof music.setVolume === "function") {
      safeCall(() => music.setVolume(services.tune("music_volume")));
    }
  });

  function sting(name) {
    if (music) services.music.sting(name);
  }

  return {
    unlockMusic,
    shoot() {
      haptic("light");
    },
    sunk(pos, label) {
      haptic("success");
      sting("coin");
      services.fx("burst", { x: pos.x, y: pos.y, color: THEME.accent, count: 18 });
      services.fx("floatText", { text: label, x: pos.x, y: pos.y - 40, color: THEME.accent, size: 22 });
    },
    exploded(pos) {
      haptic("error");
      sting("fail");
      services.fx("flash", { color: THEME.danger, opacity: 0.22 });
      services.fx("floatText", { text: "∇ exploded", x: pos.x, y: pos.y, color: THEME.danger });
    },
    stuck(pos, text) {
      haptic("warning");
      services.fx("ripple", { x: pos.x, y: pos.y, color: THEME.muted });
      services.fx("floatText", { text, x: pos.x, y: pos.y - 24, color: THEME.ink, size: 15 });
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
  stuck: "Stuck: the slope here is 0, so no η can move it. Reset and carry more speed.",
  stalled: "Stopped on a gentle slope. A bigger η will get it moving.",
  rattling: "Rolling around the hole. A smaller η will settle it.",
  stopped: "Ran out of steps while still moving.",
  exploded: "Overshoot! Each hop landed on steeper ground, so the next was bigger. +1"
};

function createGame({ shell, services, canvas, input, feedback }) {
  const course = createCourse(services);
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
  let bands = [];
  let suggestReset = false;
  let bandsKey = "";

  const tune = {
    etaMin: () => Number(services.tune("eta_min")),
    etaMax: () => Number(services.tune("eta_max")),
    maxSteps: () => Math.round(Number(services.tune("max_steps"))),
    hopMs: () => Number(services.tune("hop_ms")),
    accent: () => services.tune("accent_color") || THEME.accent
  };

  function setScene(next) { scene = next; sceneAt = clock; }
  function say(text, color) { status = { text, color, until: clock + 3200 }; }

  function begin() {
    if (started) return;
    started = true;
    services.platform("start");
    feedback.unlockMusic();
  }

  function onAimInput(view) {
    if (input.pressed) {
      begin();
      if (hitRect(input, view.resetButton)) {
        if (state.ballX !== LEVELS[state.hole].start) {
          course.addStroke(1);
          state.ballX = LEVELS[state.hole].start;
          lastPath = null;
          suggestReset = false;
          say("Back to the tee. +1 stroke.");
          services.platform("interact", { type: "reset_hole" });
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
    shot = { ...planStroke(state.land, state.ballX, eta, tune.maxSteps(), LEVELS[state.hole].momentum), hop: 0, t: 0, eta };
    course.addStroke(1);
    status = null;
    feedback.shoot();
    services.platform("interact", { type: "stroke", eta, hole: state.hole + 1 });
    setScene("rolling");
  }

  function resolveShot(view) {
    lastPath = shot.path;
    const endPos = view.ballScreen(shot.path[shot.path.length - 1]);
    if (shot.outcome === "sunk") {
      state.ballX = state.land.xMin;
      const strokes = state.strokes[state.hole];
      feedback.sunk(view.ballScreen(state.ballX), scoreName(strokes, LEVELS[state.hole].par));
      services.platform("milestone", "hole_complete", { hole: state.hole + 1, strokes });
      setScene("holeDone");
      return;
    }
    if (shot.outcome === "exploded") {
      course.addStroke(1);
      feedback.exploded({ x: Math.min(view.w - 60, Math.max(60, endPos.x)), y: view.plot.y + 40 });
      say(OUTCOME_TEXT.exploded, THEME.danger);
    } else {
      state.ballX = shot.end;
      // A true valley floor (slope ≈ 0) can't be escaped by any η; say so and point at reset.
      const trapped = shot.outcome === "stuck" && Math.abs(state.land.grad(state.ballX)) < 0.05;
      suggestReset = trapped;
      if (trapped) feedback.stuck(endPos, "side valley");
      say(trapped ? OUTCOME_TEXT.stuck : OUTCOME_TEXT[shot.outcome === "stuck" ? "stalled" : shot.outcome], trapped ? THEME.accent : undefined);
      if (trapped) status.until = clock + 6000;
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
        suggestReset = false;
        course.loadHole(state.hole + 1);
        course.checkpoint();
        setScene("aim");
      } else {
        setScene("finishing");
        course.finish().then(result => {
          summary = result;
          setScene("courseDone");
          feedback.courseDone();
          shell.timeout(() => services.pulseComplete({ score: result.strokes, text: `${result.strokes} strokes · par ${result.par}` }), 250);
        });
      }
    } else if (scene === "courseDone") {
      summary = null;
      lastPath = null;
      course.restartCourse();
      services.platform("interact", { type: "replay" });
      setScene("aim");
    }
  }

  // Meter colors depend on where the ball sits; recompute only when that changes.
  function refreshBands() {
    const key = `${state.hole}:${state.ballX}:${tune.etaMin()}:${tune.etaMax()}`;
    if (key === bandsKey) return;
    bandsKey = key;
    bands = computeMeterBands(state.land, state.ballX, LEVELS[state.hole].momentum, tune.etaMin(), tune.etaMax());
  }

  function update(dt) {
    clock += dt;
    if (scene === "aim") refreshBands();
    const view = makeView(shell, state.land);
    if (scene === "aim") onAimInput(view);
    else if (scene === "rolling") onRolling(dt, view);
    else onPanelTap();
    if (status && clock > status.until) status = null;
  }

  function render() {
    shell.prepareCanvas(canvas, g);
    const view = makeView(shell, state.land);
    const accent = tune.accent();
    if (!bands.length) refreshBands();
    renderFrame(g, view, { state, scene, aim, shot, lastPath, status, summary, clock, accent, tune, bands, suggestReset });
  }

  return { update, render, restore: course.restore };
}

// ---- main.js ----
// Entry point: build the compat shell, mount the canvas, wire input + loop,
// restore a saved round, go. Any failure renders a diagnostic screen.

window.plethoraBit = {
  async init(ctx) {
    let canvas = null;
    let failed = false;
    try {
      const shell = createShell(ctx);
      const services = createServices(ctx);
      canvas = shell.createCanvas();
      const input = shell.trackPointer(canvas);
      const feedback = createFeedback(services);
      const game = createGame({ shell, services, canvas, input, feedback });

      game.render();
      services.markReady();

      shell.loop(dt => {
        if (failed) return;
        try {
          game.update(dt);
          game.render();
        } catch (err) {
          failed = true;
          showFailure(ctx, canvas, err, "Frame error");
        } finally {
          input.frameDone();
        }
      });

      // Resume after the first frame is on screen so a slow load never blocks play.
      game.restore();
    } catch (err) {
      failed = true;
      showFailure(ctx, canvas, err, "Init error");
      if (ctx && ctx.platform && typeof ctx.platform.ready === "function") ctx.platform.ready();
    }
  }
};

})();
