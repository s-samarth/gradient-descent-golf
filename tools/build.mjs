// Bundles src/*.js (in dependency order) into the single dist/main.js Plethora
// expects, and copies plethora.json. Run: node tools/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const ORDER = [
  "levels.js", "landscape.js", "descent.js", "view.js",
  "render-scene.js", "render-hud.js", "render-frame.js",
  "course.js", "feedback.js", "game.js", "main.js"
];

const root = new URL("../", import.meta.url);
const parts = ORDER.map(file => `// ---- ${file} ----\n` + readFileSync(new URL(`src/${file}`, root), "utf8"));
const source = `(function () {\n"use strict";\n\n${parts.join("\n")}\n})();\n`;

mkdirSync(new URL("dist/", root), { recursive: true });
writeFileSync(new URL("dist/main.js", root), source);
writeFileSync(new URL("dist/plethora.json", root), readFileSync(new URL("plethora.json", root)));
console.log(`dist/main.js ${Buffer.byteLength(source)} bytes`);
