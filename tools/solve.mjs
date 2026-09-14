// Checks every hole: is it solvable, and how does a meter-reading player do?
// Run: node tools/solve.mjs   (exit code 1 if a hole is unsolvable or unfair)
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ETA_MIN = 0.0005;
const ETA_MAX = 0.6;
const MAX_STEPS = 40;
const ETA_GRID = 48;
const MAX_DEPTH = 6;

const sandbox = {};
vm.createContext(sandbox);
for (const file of ["levels.js", "landscape.js", "descent.js"]) {
  const code = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  vm.runInContext(code.replace(/^const (\w+) =/gm, "globalThis.$1 ="), sandbox);
}
const { LEVELS, makeLandscape, planStroke, etaFromDrag, classifyShot } = sandbox;
const gridEta = i => etaFromDrag(i, ETA_GRID, ETA_MIN, ETA_MAX);

// Perfect player: breadth-first search over learning rates.
function minStrokes(land, level) {
  let frontier = new Map([[level.start.toFixed(4), level.start]]);
  for (let depth = 1; depth <= MAX_DEPTH; depth++) {
    const next = new Map();
    for (const x of frontier.values()) {
      for (let i = 0; i <= ETA_GRID; i++) {
        const shot = planStroke(land, x, gridEta(i), MAX_STEPS, level.momentum);
        if (shot.outcome === "sunk") return depth;
        if (shot.outcome !== "exploded") next.set(shot.end.toFixed(4), shot.end);
      }
    }
    frontier = next;
  }
  return Infinity;
}

// Learning player: reads the meter (never red), starts gentle and tries a bigger η
// each time a shot stalls in the wrong valley, resetting to the tee (+1) to retry.
// Near the flag it switches to small green η. Random start point in the green band.
function meterPlayer(land, level, seed) {
  let r = seed;
  const rand = () => (r = (r * 16807) % 2147483647) / 2147483647;
  let x = level.start;
  let strokes = 0;
  let attempt = rand() * 0.4;
  while (strokes < 40) {
    const bands = [];
    for (let i = 0; i <= ETA_GRID; i++) bands.push({ i, kind: classifyShot(land, x, gridEta(i), level.momentum) });
    const near = Math.abs(x - land.xMin) < 0.08;
    let pool = bands.filter(b => b.kind === "smooth" || (!near && b.kind === "bouncy"));
    if (!pool.length) pool = bands.filter(b => b.kind !== "explode");
    const t = near ? rand() * 0.5 : Math.min(1, attempt);
    const pick = pool[Math.min(pool.length - 1, Math.floor(t * pool.length))];
    const shot = planStroke(land, x, gridEta(pick.i), MAX_STEPS, level.momentum);
    strokes += shot.outcome === "exploded" ? 2 : 1;
    if (shot.outcome === "sunk") return strokes;
    if (shot.outcome === "exploded") { attempt = Math.max(0, attempt - 0.15); continue; }
    x = shot.end;
    const stalledFar = shot.outcome === "stuck" && Math.abs(x - land.xMin) >= 0.08;
    if (stalledFar) {
      strokes += 1;
      x = level.start;
      attempt += 0.2 + rand() * 0.1;
    }
  }
  return strokes;
}

let failed = false;
LEVELS.forEach((level, i) => {
  const land = makeLandscape(level);
  const best = minStrokes(land, level);
  let total = 0;
  for (let s = 1; s <= 80; s++) total += meterPlayer(land, level, s * 7919);
  const typical = total / 80;
  const kinds = {};
  for (let j = 0; j <= ETA_GRID; j++) {
    const k = classifyShot(land, level.start, gridEta(j), level.momentum);
    kinds[k] = (kinds[k] || 0) + 1;
  }
  const unfair = !Number.isFinite(best) || typical > level.par + 4;
  if (unfair) failed = true;
  console.log(
    `${i + 1}. ${level.name.padEnd(16)} β=${level.momentum} best=${best} meter-player≈${typical.toFixed(1)} ` +
    `par=${level.par}${unfair ? "  ← CHECK" : ""}  tee-meter=${JSON.stringify(kinds)}`
  );
});
process.exit(failed ? 1 : 0);
