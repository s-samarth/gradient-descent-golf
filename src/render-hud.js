// HUD: hole header, reset button, status line, and result panels.

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

// pulseClock: pass the game clock to make the button glow (used when reset is the only way out).
function drawResetButton(g, view, enabled, pulseClock) {
  const b = view.resetButton;
  g.globalAlpha = enabled ? 1 : 0.35;
  roundRectPath(g, b.x, b.y, b.w, b.h, 17);
  if (pulseClock !== null && pulseClock !== undefined && enabled) {
    g.fillStyle = `rgba(255,209,102,${0.18 + 0.14 * Math.sin(pulseClock / 180)})`;
    g.fill();
    g.strokeStyle = THEME.accent;
    g.lineWidth = 2;
  } else {
    g.strokeStyle = THEME.axis;
    g.lineWidth = 1;
  }
  g.stroke();
  g.fillStyle = THEME.ink;
  g.font = `600 13px ${THEME.font}`;
  g.textAlign = "center";
  g.fillText("↺ reset +1", b.x + b.w / 2, b.y + b.h / 2 + 5);
  g.globalAlpha = 1;
}

function drawStatus(g, view, text, color) {
  if (!text) return;
  g.textAlign = "center";
  g.fillStyle = color || THEME.ink;
  g.font = `700 15px ${THEME.font}`;
  const lines = wrapText(g, text, view.w - 32).slice(0, 2);
  const bottom = view.plot.y - 10;
  lines.forEach((line, i) => g.fillText(line.trim(), view.w / 2, bottom - (lines.length - 1 - i) * 19));
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
