// Screen layout: where the plot, meter, and buttons live for the current size.
// Recomputed every frame from the shell's size so rotation and resizes just work.

const THEME = {
  bg: "#0c1015",
  grid: "rgba(255,255,255,0.045)",
  axis: "rgba(255,255,255,0.22)",
  ink: "#eef3ee",
  muted: "rgba(238,243,238,0.58)",
  turfTop: "#2c9a5f",
  turfBottom: "#0f2a1e",
  curve: "#8ff0b4",
  ball: "#ffffff",
  flag: "#ff5d5d",
  danger: "#ff6b6b",
  accent: "#ffd166",
  font: "system-ui, -apple-system, 'Segoe UI', sans-serif"
};

function makeView(shell, land) {
  const w = shell.width();
  const h = shell.height();
  const safe = shell.safeArea();
  const padX = Math.max(20, safe.left, safe.right) + 4;
  const top = safe.top + 16;

  const plot = {
    x: padX,
    y: top + 118,
    w: w - padX * 2,
    h: Math.max(160, h - safe.bottom - 150 - (top + 118))
  };
  const meter = { x: padX + 8, y: plot.y + plot.h + 58, w: w - padX * 2 - 16, h: 10 };
  const resetButton = { x: w - padX - 84, y: top + 52, w: 84, h: 34 };
  const curveHeight = plot.h * 0.82;

  function toScreen(theta, loss) {
    const sx = plot.x + theta * plot.w;
    const sy = plot.y + plot.h - (loss / land.maxLoss) * curveHeight;
    return { x: sx, y: sy };
  }

  function ballScreen(theta) {
    const clamped = Math.min(1, Math.max(0, theta));
    const p = toScreen(theta, land.loss(clamped));
    return { x: p.x, y: p.y - 7 };
  }

  return { w, h, top, plot, meter, resetButton, toScreen, ballScreen };
}

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
