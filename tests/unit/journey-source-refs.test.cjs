"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { locateInSource } = require("../../lib/journey/source-refs.cjs");

function tree() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "uat-src-"));
  fs.mkdirSync(path.join(d, "screens"));
  fs.mkdirSync(path.join(d, "node_modules"));
  fs.writeFileSync(path.join(d, "screens", "Hall.tsx"), "// the Estate is mentioned here\nconst a = 1;\nconst t = \"the Estate\";\n");
  fs.writeFileSync(path.join(d, "api.ts"), "export const Estate = 1;\n");
  fs.writeFileSync(path.join(d, "node_modules", "x.ts"), "Estate\n");
  return d;
}

test("locateInSource: returns a repo-relative label with a line, skipping comments and node_modules", () => {
  const d = tree();
  const hit = locateInSource(d, "the Estate", { prefer: "web/src/screens/Hall.tsx" });
  assert.equal(hit, "web/src/screens/Hall.tsx:3");
  assert.doesNotMatch(hit, new RegExp(d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  fs.rmSync(d, { recursive: true, force: true });
});

test("locateInSource: prefers the named file, falls back to any, and is null when absent", () => {
  const d = tree();
  assert.equal(locateInSource(d, "Estate = 1", { prefer: "web/src/screens/Hall.tsx" }), "web/src/api.ts:1");
  assert.equal(locateInSource(d, "no such text"), null);
  assert.equal(locateInSource(null, "x"), null);
  fs.rmSync(d, { recursive: true, force: true });
});
