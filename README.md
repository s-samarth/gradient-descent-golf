# Gradient Descent Golf

A [Plethora](https://plethora.studio) Bit: nine holes of real (stochastic) gradient descent.
Drag to pick a learning rate η, release, and the ball steps θ ← θ − η·(∇L + noise)
toward the global minimum. Too small crawls, too big explodes.

## Layout

- `src/` — game source, split into small plain-script files (no imports; bundled in order)
- `plethora.json` — Bit manifest (permissions, leaderboard, progress, tuning, onboarding)
- `dist/` — build output uploaded to Plethora (`main.js` + `plethora.json`)
- `tools/build.mjs` — bundles `src/` into `dist/main.js`
- `tools/validate.mjs` — local checks against the Plethora contract
- `tools/solve.mjs` — proves every hole is solvable and sanity-checks par
- `preview/` — local browser harness with a mock `ctx` (not shipped)

## Workflow

```bash
node tools/solve.mjs && node tools/build.mjs && node tools/validate.mjs
python3 -m http.server 8765   # then open http://localhost:8765/preview/
```

Drafts are uploaded with a paired Plethora agent token; publishing is manual in the Plethora app.
