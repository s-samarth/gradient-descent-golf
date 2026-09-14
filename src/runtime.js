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
