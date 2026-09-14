// If anything fails at startup or mid-frame, show the error plus what this
// runtime actually provides, instead of a blank screen. A screenshot of this
// is enough to diagnose runtime mismatches.

function describeRuntime(ctx) {
  const lines = [];
  const runtime = ctx && ctx.runtime ? `${ctx.runtime.version || "?"} sdk ${ctx.runtime.sdkVersion || "?"}` : "no ctx.runtime";
  lines.push(runtime);
  if (!ctx) return lines;
  const keys = Object.keys(ctx).sort();
  lines.push(`ctx: ${keys.join(", ")}`);
  const groups = { input: ctx.input, game: ctx.game, platform: ctx.platform, tune: ctx.tune, fx: ctx.fx, music: ctx.music };
  for (const [group, value] of Object.entries(groups)) {
    lines.push(`${group}: ${value && typeof value === "object" ? Object.keys(value).join(", ") || "{}" : String(value)}`);
  }
  return lines;
}

function showFailure(ctx, canvas, err, stage) {
  const message = `${stage}: ${err && err.message ? err.message : String(err)}`;
  const lines = [message, ...describeRuntime(ctx)];
  try {
    if (ctx && ctx.platform && typeof ctx.platform.error === "function") ctx.platform.error({ message, stage });
  } catch (ignored) {
    // Reporting is best-effort.
  }

  if (!canvas && ctx && typeof ctx.createCanvas2D === "function") {
    try { canvas = ctx.createCanvas2D(); } catch (ignored) { canvas = null; }
  }
  if (!canvas && ctx && typeof ctx.createRoot === "function") {
    try {
      const root = ctx.createRoot({ style: "padding:60px 20px;color:#eee;background:#0c1015;font:12px monospace;white-space:pre-wrap" });
      root.textContent = lines.join("\n\n");
    } catch (ignored) {
      // Nothing else we can do.
    }
    return;
  }
  const g = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  if (!g) return;
  const w = canvas.clientWidth || 360;
  const h = canvas.clientHeight || 640;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = "#0c1015";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#ff6b6b";
  g.font = "700 16px system-ui, sans-serif";
  g.fillText("Gradient Descent Golf hit an error", 20, 70);
  g.font = "12px ui-monospace, Menlo, monospace";
  let y = 100;
  for (const line of lines) {
    for (const chunk of wrapText(g, line, w - 40)) {
      g.fillStyle = y === 100 ? "#ffd166" : "rgba(238,243,238,0.75)";
      g.fillText(chunk, 20, y);
      y += 17;
      if (y > h - 40) return;
    }
    y += 6;
  }
}

function wrapText(g, text, maxWidth) {
  const out = [];
  let line = "";
  for (const word of String(text).split(/(\s+|,)/)) {
    if (g.measureText(line + word).width > maxWidth && line) {
      out.push(line);
      line = word.trimStart();
    } else {
      line += word;
    }
  }
  if (line) out.push(line);
  return out;
}
