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
