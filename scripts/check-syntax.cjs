// `node --check` over the driver, the journey CLI and every lib/**/*.cjs, so a new module is covered by
// `npm run check` without editing a hand-kept list. Syntax only; the tests are `npm test`.
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const files = ["uat_driver.cjs", "uat_journey.cjs"];
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel);
    else if (e.name.endsWith(".cjs")) files.push(rel);
  }
})("lib");
files.push(...fs.readdirSync(path.join(root, "journeys"), { recursive: true }).filter((f) => String(f).endsWith(".cjs")).map((f) => path.join("journeys", String(f))));

for (const f of files) {
  const r = spawnSync(process.execPath, ["--check", path.join(root, f)], { encoding: "utf8" });
  if (r.status !== 0) { console.error(`syntax check failed: ${f}\n${r.stderr}`); process.exit(1); }
}
console.log(`syntax ok: ${files.length} files`);
