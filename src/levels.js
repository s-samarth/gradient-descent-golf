// Nine holes. bowl = a·(θ − c)², dips = Gaussian valleys, curvature = f''
// at the global minimum (critical η = 2 / curvature). noise = SGD gradient noise (kick size scales with η). Check with tools/solve.mjs.

const LEVELS = [
  {
    name: "Convex warmup",
    tip: "One valley. Any sane η gets you there.",
    bowl: { a: 1, c: 0.62 }, dips: [], start: 0.06, noise: 0, curvature: 30, par: 2
  },
  {
    name: "Steep bowl",
    tip: "High curvature. Too much η and you bounce out.",
    bowl: { a: 1, c: 0.4 }, dips: [], start: 0.94, noise: 0, curvature: 140, par: 2
  },
  {
    name: "Local trap",
    tip: "Noisy gradients now. Bigger η, bigger kicks.",
    bowl: { a: 1.4, c: 0.6 },
    dips: [{ mu: 0.28, depth: 0.22, sigma: 0.045 }, { mu: 0.72, depth: 0.12, sigma: 0.05 }],
    start: 0.05, noise: 0.6, curvature: 40, par: 3
  },
  {
    name: "The plateau",
    tip: "Flat ground, tiny gradients. Crawl or leap?",
    bowl: { a: 0.15, c: 0.9 },
    dips: [{ mu: 0.82, depth: 0.2, sigma: 0.06 }],
    start: 0.08, noise: 0.5, curvature: 45, par: 4
  },
  {
    name: "Narrow minimum",
    tip: "Sharp hole. Finish with a gentle η.",
    bowl: { a: 0.9, c: 0.52 },
    dips: [{ mu: 0.52, depth: 0.08, sigma: 0.018 }],
    start: 0.92, noise: 0.4, curvature: 160, par: 3
  },
  {
    name: "Twin valleys",
    tip: "Two look alike. Only one is global.",
    bowl: { a: 0.6, c: 0.5 },
    dips: [{ mu: 0.25, depth: 0.2, sigma: 0.06 }, { mu: 0.75, depth: 0.3, sigma: 0.06 }],
    start: 0.08, noise: 1.2, curvature: 50, par: 5
  },
  {
    name: "Bumpy loss",
    tip: "Noise everywhere. Momentum would help. You don't have it.",
    bowl: { a: 1.2, c: 0.5 },
    dips: [
      { mu: 0.15, depth: 0.05, sigma: 0.025 }, { mu: 0.32, depth: 0.06, sigma: 0.025 },
      { mu: 0.5, depth: 0.1, sigma: 0.03 }, { mu: 0.68, depth: 0.06, sigma: 0.025 },
      { mu: 0.85, depth: 0.05, sigma: 0.025 }
    ],
    start: 0.06, noise: 0.8, curvature: 60, par: 4
  },
  {
    name: "Overfit hills",
    tip: "The deepest point hides behind a ridge.",
    bowl: { a: 0.7, c: 0.6 },
    dips: [
      { mu: 0.3, depth: 0.1, sigma: 0.05 }, { mu: 0.55, depth: 0.06, sigma: 0.03 },
      { mu: 0.84, depth: 0.3, sigma: 0.045 }
    ],
    start: 0.08, noise: 0.8, curvature: 80, par: 5
  },
  {
    name: "The final epoch",
    tip: "Everything you learned. Converge.",
    bowl: { a: 1, c: 0.55 },
    dips: [
      { mu: 0.12, depth: 0.1, sigma: 0.03 }, { mu: 0.36, depth: 0.12, sigma: 0.04 },
      { mu: 0.63, depth: 0.22, sigma: 0.04 }, { mu: 0.8, depth: 0.1, sigma: 0.04 }
    ],
    start: 0.92, noise: 0.8, curvature: 120, par: 5
  }
];
