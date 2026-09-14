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
