// Nine holes. bowl = a·(θ − c)², dips = Gaussian valleys, curvature = f''
// at the global minimum (critical η = 2 / curvature). momentum = β, how much speed the ball keeps between steps. Check with tools/solve.mjs.

const LEVELS = [
  {
    name: "Convex warmup",
    tip: "Each hop = η × slope. Steep ground, big hop.",
    bowl: { a: 1, c: 0.62 }, dips: [], start: 0.06, momentum: 0, curvature: 30, par: 2
  },
  {
    name: "Steep bowl",
    tip: "Walls this steep turn a big η into a ping-pong.",
    bowl: { a: 1, c: 0.4 }, dips: [], start: 0.94, momentum: 0, curvature: 140, par: 2
  },
  {
    name: "Local trap",
    tip: "Momentum on: the ball keeps its speed over small dips.",
    bowl: { a: 1.4, c: 0.6 },
    dips: [{ mu: 0.28, depth: 0.22, sigma: 0.045 }, { mu: 0.72, depth: 0.12, sigma: 0.05 }],
    start: 0.16, momentum: 0.9, curvature: 40, par: 3
  },
  {
    name: "The plateau",
    tip: "Flat ground means tiny slope. Momentum builds speed.",
    bowl: { a: 0.15, c: 0.9 },
    dips: [{ mu: 0.82, depth: 0.2, sigma: 0.06 }],
    start: 0.08, momentum: 0.8, curvature: 45, par: 3
  },
  {
    name: "Narrow minimum",
    tip: "Sharp hole. Too much η and you hop right over it.",
    bowl: { a: 0.9, c: 0.52 },
    dips: [{ mu: 0.52, depth: 0.08, sigma: 0.018 }],
    start: 0.84, momentum: 0.9, curvature: 160, par: 2
  },
  {
    name: "Twin valleys",
    tip: "Roll through the first valley into the deeper one.",
    bowl: { a: 1.8, c: 0.5 },
    dips: [{ mu: 0.3, depth: 0.15, sigma: 0.06 }, { mu: 0.7, depth: 0.25, sigma: 0.07 }],
    start: 0.04, momentum: 0.7, curvature: 50, par: 5
  },
  {
    name: "Bumpy loss",
    tip: "Less momentum now. Too small an η stalls in a dip.",
    bowl: { a: 1.2, c: 0.5 },
    dips: [
      { mu: 0.15, depth: 0.05, sigma: 0.025 }, { mu: 0.32, depth: 0.06, sigma: 0.025 },
      { mu: 0.5, depth: 0.1, sigma: 0.03 }, { mu: 0.68, depth: 0.06, sigma: 0.025 },
      { mu: 0.85, depth: 0.05, sigma: 0.025 }
    ],
    start: 0.06, momentum: 0.6, curvature: 60, par: 5
  },
  {
    name: "Overfit hills",
    tip: "Two traps on the way down. Keep your speed up.",
    bowl: { a: 2.6, c: 0.7 },
    dips: [
      { mu: 0.28, depth: 0.1, sigma: 0.04 }, { mu: 0.5, depth: 0.1, sigma: 0.03 },
      { mu: 0.74, depth: 0.2, sigma: 0.04 }
    ],
    start: 0.1, momentum: 0.6, curvature: 80, par: 4
  },
  {
    name: "The final epoch",
    tip: "Par 3. Everything you learned. Converge.",
    bowl: { a: 1, c: 0.55 },
    dips: [
      { mu: 0.12, depth: 0.1, sigma: 0.03 }, { mu: 0.36, depth: 0.12, sigma: 0.04 },
      { mu: 0.63, depth: 0.22, sigma: 0.04 }, { mu: 0.8, depth: 0.1, sigma: 0.04 }
    ],
    start: 0.92, momentum: 0.8, curvature: 120, par: 3
  }
];
