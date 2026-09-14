// HUD: hole header, reset button, learning-rate meter, and result panels.

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

function drawResetButton(g, view, enabled) {
  const b = view.resetButton;
  g.globalAlpha = enabled ? 1 : 0.35;
  roundRectPath(g, b.x, b.y, b.w, b.h, 17);
  g.strokeStyle = THEME.axis;
  g.lineWidth = 1;
  g.stroke();
  g.fillStyle = THEME.ink;
  g.font = `600 13px ${THEME.font}`;
  g.textAlign = "center";
  g.fillText("↺ reset +1", b.x + b.w / 2, b.y + b.h / 2 + 5);
  g.globalAlpha = 1;
}

function drawMeter(g, view, land, eta, etaMin, etaMax, accent, active) {
  const m = view.meter;
  const toX = v => m.x + (Math.log(v / etaMin) / Math.log(etaMax / etaMin)) * m.w;
  const critX = Math.min(m.x + m.w, Math.max(m.x, toX(land.criticalEta)));

  roundRectPath(g, m.x, m.y, m.w, m.h, m.h / 2);
  g.fillStyle = "rgba(255,255,255,0.08)";
  g.fill();
  g.save();
  roundRectPath(g, m.x, m.y, m.w, m.h, m.h / 2);
  g.clip();
  g.fillStyle = "rgba(255,107,107,0.28)";
  g.fillRect(critX, m.y, m.x + m.w - critX, m.h);
  g.restore();

  g.textAlign = "left";
  g.font = `600 11px ${THEME.font}`;
  g.fillStyle = THEME.muted;
  g.fillText("crawl", m.x, m.y + 26);
  g.textAlign = "right";
  g.fillStyle = THEME.danger;
  g.fillText("diverge near the hole →", m.x + m.w, m.y + 26);

  if (!active) {
    g.textAlign = "center";
    g.fillStyle = THEME.muted;
    g.font = `600 14px ${THEME.font}`;
    g.fillText("Drag anywhere to set η, release to descend", view.w / 2, m.y - 18);
    return;
  }
  const x = toX(eta);
  g.fillStyle = eta > land.criticalEta ? THEME.danger : accent;
  g.beginPath();
  g.arc(x, m.y + m.h / 2, 9, 0, Math.PI * 2);
  g.fill();
  g.textAlign = "center";
  g.font = `700 22px ${THEME.font}`;
  g.fillText(`η = ${formatEta(eta)}`, view.w / 2, m.y - 16);
}

function drawStatus(g, view, text, color) {
  if (!text) return;
  g.textAlign = "center";
  g.fillStyle = color || THEME.ink;
  g.font = `700 16px ${THEME.font}`;
  g.fillText(text, view.w / 2, view.plot.y - 12);
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
