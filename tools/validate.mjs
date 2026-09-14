// Local contract checks against the Plethora schema limits and SDK anti-patterns.
// Run after build: node tools/validate.mjs
import { readFileSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url);
const source = readFileSync(new URL("dist/main.js", root), "utf8");
const manifest = JSON.parse(readFileSync(new URL("dist/plethora.json", root), "utf8"));
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

const REQUIRED = ["schemaVersion", "runtime", "entry", "title", "description", "permissions", "dependencies"];
const FIELDS = ["schemaVersion", "runtime", "entry", "title", "description", "tags", "permissions",
  "dependencies", "externalDependencies", "memory", "game", "tuning", "onboarding"];
const PERMS = ["audio", "backgroundMusic", "camera", "haptics", "microphone", "motion", "storage"];
const KNOB_TYPES = ["number", "integer", "boolean", "choice", "multi_choice", "color", "range",
  "point2", "vec2", "seed", "duration_ms", "percent"];

REQUIRED.forEach(k => check(k in manifest, `manifest missing ${k}`));
Object.keys(manifest).forEach(k => check(FIELDS.includes(k), `unknown manifest field ${k}`));
check(manifest.schemaVersion === 1 && manifest.runtime === "plethora-bit@2", "bad schemaVersion/runtime");
check((manifest.tags || []).length <= 12, "too many tags");
(manifest.tags || []).forEach(t => check(/^[a-z0-9-]{1,32}$/.test(t), `bad tag ${t}`));
manifest.permissions.forEach(p => check(PERMS.includes(p), `bad permission ${p}`));

for (const [id, knob] of Object.entries(manifest.tuning?.knobs || {})) {
  check(KNOB_TYPES.includes(knob.type), `knob ${id} bad type`);
  check(source.includes(`"${id}"`), `knob ${id} declared but unused`);
}
for (const id of Object.keys(manifest.memory?.records || {})) {
  check(/^[a-z][a-z0-9_]{0,47}$/.test(id) && source.includes(id), `record ${id} invalid or unused`);
}
const ob = manifest.onboarding;
check(ob && ["immersive", "one_line", "guided", "briefing"].includes(ob.kind), "onboarding kind");
(ob?.steps || []).forEach(s => {
  check(s.title.length <= 80 && s.body.length <= 360 && s.id.length <= 48, `onboarding step ${s.id} too long`);
});

const uses = { haptics: /platform\.haptic\(|"haptic"/, backgroundMusic: /ctx\.music\./, audio: /ctx\.audio\./,
  storage: /ctx\.storage\./, motion: /ctx\.motion\./, camera: /ctx\.camera\./, microphone: /ctx\.microphone\./ };
for (const [perm, re] of Object.entries(uses)) {
  if (re.test(source)) check(manifest.permissions.includes(perm), `source uses ${perm} but manifest lacks it`);
}

const banned = [
  [/document\.body/, "document.body"], [/document\.createElement\(\s*["']script/, "script tag"],
  [/requestAnimationFrame/, "raw requestAnimationFrame"], [/(?<!ctx\.)\baddEventListener\(/, "raw addEventListener"],
  [/https?:\/\//, "hard-coded URL"], [/\bfetch\(/, "fetch"], [/new Worker/, "worker"], [/WebSocket/, "websocket"]
];
// runtime.js and diagnostics.js hold deliberate fallbacks for older Plethora runtimes
// (raw listeners/rAF/canvas only when ctx lacks the helper), so they are exempt.
const exempt = /\/\/ ---- (runtime|diagnostics)\.js ----[\s\S]*?(?=\/\/ ---- )/g;
const checked = source.replace(exempt, "");
banned.forEach(([re, name]) => check(!re.test(checked), `anti-pattern: ${name}`));
// Rules the Plethora upload server enforces on the whole package, fallbacks included.
[[/requestAnimationFrame/, "requestAnimationFrame (use ctx.onFrame)"], [/document\.(body|documentElement)/, "mounting on document.body/documentElement"],
  [/createElement\(\s*["']canvas/, "raw canvas (use ctx.createCanvas2D)"]]
  .forEach(([re, name]) => check(!re.test(source), `server rule: ${name}`));
check(Buffer.byteLength(source) < 2097152, "package too large");

for (const file of readdirSync(new URL("src/", root))) {
  check(source.includes(`// ---- ${file} ----`), `src/${file} is not in the build order (tools/build.mjs)`);
}

try { new Function(source); } catch (err) { errors.push(`syntax: ${err.message}`); }

if (errors.length) { console.error(errors.map(e => `✗ ${e}`).join("\n")); process.exit(1); }
console.log("✓ manifest and source pass local contract checks");
