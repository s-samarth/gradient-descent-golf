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
