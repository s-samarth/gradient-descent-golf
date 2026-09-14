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
