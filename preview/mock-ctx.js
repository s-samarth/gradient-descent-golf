// Minimal stand-in for the Plethora runtime `ctx`, covering only what this Bit uses.
// For local browser testing only; never shipped.

window.__clock = 0;
window.createMockCtx = function createMockCtx(container, manifest) {
  const events = (window.__events = []);
  const log = (name, payload) => events.push({ name, payload, t: Math.round(performance.now()) });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const tuneDefaults = Object.fromEntries(
    Object.entries(manifest.tuning?.knobs || {}).map(([id, k]) => [id, k.default])
  );
  const tuneGet = id => tuneDefaults[id];

  function createCanvas2D() {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;touch-action:none";
    container.appendChild(canvas);
    const fit = () => {
      canvas.width = container.clientWidth * dpr;
      canvas.height = container.clientHeight * dpr;
      canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    new ResizeObserver(fit).observe(container);
    return canvas;
  }

  function track(target) {
    const s = { x: 0, y: 0, down: false, pressed: false, released: false,
      frameDone() { s.pressed = false; s.released = false; } };
    const pos = e => { const r = target.getBoundingClientRect(); s.x = e.clientX - r.left; s.y = e.clientY - r.top; };
    target.addEventListener("pointerdown", e => { target.setPointerCapture(e.pointerId); pos(e); s.down = true; s.pressed = true; });
    target.addEventListener("pointermove", e => { if (s.down) pos(e); });
    target.addEventListener("pointerup", e => { pos(e); s.down = false; s.released = true; });
    return s;
  }

  function floatText({ text, x, y, color }) {
    const el = document.createElement("div");
    el.textContent = text;
    el.style.cssText = `position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-50%);color:${color};` +
      "font:700 18px system-ui;pointer-events:none;transition:all .9s ease-out;z-index:5";
    container.appendChild(el);
    requestAnimationFrame(() => { el.style.top = `${y - 40}px`; el.style.opacity = "0"; });
    setTimeout(() => el.remove(), 1000);
  }

  const store = key => ({
    load: async () => JSON.parse(localStorage.getItem(key) || "null"),
    put: v => localStorage.setItem(key, JSON.stringify(v))
  });
  const progress = store("gdg-progress");

  let scoreValue = 0;
  const ctx = {
    container,
    get width() { return container.clientWidth; },
    get height() { return container.clientHeight; },
    dpr,
    safeArea: { top: 47, bottom: 34, left: 0, right: 0 },
    manifest,
    capabilities: { haptics: true, backgroundMusic: true },
    createCanvas2D,
    markVisualReady: r => log("visualReady", r),
    input: {
      track,
      hitRect: (p, x, y, w, h) => p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h
    },
    game: {
      loop({ input, update, render }) {
        // Test hook: advance the loop deterministically when rAF is throttled.
        window.__step = (n = 1, dt = 16) => {
          for (let i = 0; i < n; i++) { __clock += dt; update(dt); if (render) render(); if (input) input.frameDone(); }
        };
        let last = performance.now();
        const frame = now => {
          const dt = Math.min(50, now - last);
          last = now;
          update(dt);
          if (render) render();
          if (input) input.frameDone();
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      },
      score: () => ({
        get value() { return scoreValue; },
        add: n => { scoreValue += n; },
        set: n => { scoreValue = n; },
        reset: () => { scoreValue = 0; },
        submit: async (ch, o) => { log("record", { ch, value: scoreValue, ...o }); return { isPersonalBest: true }; }
      }),
      progress: {
        load: async () => {
          const v = await progress.load();
          return v ? { ...v, resumeEligible: v.status === "in_progress" } : null;
        },
        save: async (ch, p) => { progress.put({ ...p, status: "in_progress" }); log("progress.save", p.state); },
        complete: async (ch, p) => { progress.put({ ...p, status: "completed" }); log("progress.complete"); },
        abandon: async () => { localStorage.removeItem("gdg-progress"); log("progress.abandon"); }
      }
    },
    tune: {
      number: tuneGet, integer: tuneGet, durationMs: tuneGet, color: tuneGet, percent: tuneGet,
      onChange: () => () => {}
    },
    fx: {
      floatText,
      burst: o => log("fx.burst", o), ripple: o => log("fx.ripple", o),
      flash: o => log("fx.flash", o)
    },
    music: {
      unlock: async () => log("music.unlock"),
      play: o => { log("music.play", o); return { setVolume() {} }; },
      sting: async n => log("music.sting", n)
    },
    platform: {
      ready: () => log("ready"), start: () => log("start"), interact: p => log("interact", p),
      milestone: (n, p) => log("milestone", { n, ...p }), complete: p => log("complete", p),
      haptic: k => log("haptic", k)
    },
    pulse: { complete: o => log("pulse.complete", o) },
    timeout: (fn, ms) => setTimeout(fn, ms)
  };

  // ?legacy=1 imitates the older runtime seen on-device: no ctx.input, game, tune, fx, music.
  if (new URLSearchParams(location.search).has("legacy")) {
    const loop = ctx.game.loop;
    for (const key of ["input", "game", "tune", "fx", "music", "pulse", "markVisualReady", "timeout"]) delete ctx[key];
    ctx.onFrame = cb => loop({ update: cb });
  }
  return ctx;
};
