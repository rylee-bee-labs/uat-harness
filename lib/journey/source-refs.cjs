// Point a finding at the product source: find the first line of a source tree that holds a given string,
// preferring one named file. Read-only; returns a short repo-relative label like "web/src/screens/Hall.tsx:156",
// never an absolute machine path.
"use strict";

const fs = require("fs");
const path = require("path");

const EXT = new Set([".ts", ".tsx", ".css", ".js", ".cjs", ".mjs"]);

function* walk(dir) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (EXT.has(path.extname(e.name))) yield p;
  }
}

// srcRoot: the product's web/src directory. labelPrefix: how that directory is named in the repo ("web/src").
function locateInSource(srcRoot, needle, { prefer = null, labelPrefix = "web/src" } = {}) {
  if (!srcRoot || !needle || !fs.existsSync(srcRoot)) return null;
  const preferSuffix = prefer ? prefer.replace(/^web\/src\//, "") : null;
  let fallback = null;
  for (const file of walk(srcRoot)) {
    const rel = path.relative(srcRoot, file).split(path.sep).join("/");
    const isPreferred = preferSuffix && rel === preferSuffix;
    if (!isPreferred && fallback && preferSuffix) continue;
    const lines = fs.readFileSync(file, "utf8").split("\n");
    const i = lines.findIndex((l) => { const t = l.trim(); return l.includes(needle) && !(t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")); });
    if (i === -1) continue;
    const label = `${labelPrefix}/${rel}:${i + 1}`;
    if (isPreferred || !preferSuffix) return label;
    if (!fallback) fallback = label;
  }
  return fallback;
}

module.exports = { locateInSource };
