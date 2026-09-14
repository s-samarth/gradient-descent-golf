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
