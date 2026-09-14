// Checks every hole is solvable and reports the minimum strokes with a
// perfect player (BFS over a grid of learning rates). Run: node tools/solve.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ETA_MIN = 0.0005;
const ETA_MAX = 0.6;
const MAX_STEPS = 30;
const ETA_GRID = 48;
const MAX_DEPTH = 6;

const sandbox = {};
vm.createContext(sandbox);
for (const file of ["levels.js", "landscape.js", "descent.js"]) {
  const code = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  vm.runInContext(code.replace(/^const (\w+) =/gm, "globalThis.$1 ="), sandbox);
}
const { LEVELS, makeLandscape, planStroke, etaFromDrag, strokeSeed } = sandbox;

function minStrokes(land, start, hole) {
  let frontier = new Map([[start.toFixed(4), start]]);
  for (let depth = 1; depth <= MAX_DEPTH; depth++) {
    const next = new Map();
    for (const x of frontier.values()) {
      for (let i = 0; i <= ETA_GRID; i++) {
        const eta = etaFromDrag(i, ETA_GRID, ETA_MIN, ETA_MAX);
        const shot = planStroke(land, x, eta, MAX_STEPS, strokeSeed(hole, depth - 1));
        if (shot.outcome === "sunk") return depth;
        if (shot.outcome !== "exploded") next.set(shot.end.toFixed(4), shot.end);
      }
    }
    frontier = next;
  }
  return Infinity;
}

// A sensible player who can see the flag but not the math: big η when far,
// small η when close, and backs off when the preview arrow shows an explosion.
// Averaged over many random players. If this is far above par, the hole is unfair.
function sensibleStrokes(land, start, hole, rngSeed) {
  let r = rngSeed;
  const rand = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  let x = start;
  let strokes = 0;
  while (strokes < 40) {
    const near = Math.abs(x - land.xMin) < 0.06;
    let f = near ? 0.2 + rand() * 0.3 : 0.45 + rand() * 0.4;
    let eta = etaFromDrag(f, 1, ETA_MIN, ETA_MAX);
    while (f > 0.05) {
      const nx = x - eta * land.grad(x);
      if (nx >= 0 && nx <= 1) break;
      f -= 0.05;
      eta = etaFromDrag(f, 1, ETA_MIN, ETA_MAX);
    }
    const shot = planStroke(land, x, eta, MAX_STEPS, strokeSeed(hole, strokes));
    strokes += shot.outcome === "exploded" ? 2 : 1;
    if (shot.outcome === "sunk") return strokes;
    if (shot.outcome !== "exploded") x = shot.end;
  }
  return strokes;
}

function averageSensible(land, start, hole) {
  let total = 0;
  for (let i = 1; i <= 60; i++) total += sensibleStrokes(land, start, hole, i * 7777);
  return total / 60;
}

let failed = false;
LEVELS.forEach((level, i) => {
  const land = makeLandscape(level);
  const best = minStrokes(land, level.start, i);
  const sensible = averageSensible(land, level.start, i);
  const counts = {};
  for (let j = 0; j <= ETA_GRID; j++) {
    const eta = etaFromDrag(j, ETA_GRID, ETA_MIN, ETA_MAX);
    const o = planStroke(land, level.start, eta, MAX_STEPS).outcome;
    counts[o] = (counts[o] || 0) + 1;
  }
  const ok = best <= level.par - 1 || (best === 1 && level.par <= 2);
  if (!Number.isFinite(best) || sensible > level.par + 12) failed = true;
  console.log(
    `${i + 1}. ${level.name.padEnd(16)} θ*=${land.xMin.toFixed(3)} ηcrit=${land.criticalEta.toFixed(4)} ` +
    `best=${best} sensible≈${sensible.toFixed(1)} par=${level.par} ${ok ? "" : "(check par)"} first-shot=${JSON.stringify(counts)}`
  );
});
process.exit(failed ? 1 : 0);
