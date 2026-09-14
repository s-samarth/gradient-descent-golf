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
