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
