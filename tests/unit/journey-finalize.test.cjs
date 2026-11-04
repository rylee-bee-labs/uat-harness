// Adversarial tests for Gate 0 leak cases 1 and 4: every shareable file is scanned at finalization,
// and the shareable set never includes (or points at) screenshots or raw accessibility trees.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { shareableFiles, scanShareable, finalizeJourney } = require("../../lib/journey/finalize.cjs");
const { renderReport } = require("../../lib/journey/report.cjs");

function tmpDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `uat-journey-finalize-${tag}-`));
}

function writeStage(out, files) {
  const stage = path.join(out, ".staging");
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(stage, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return stage;
}

test("a private address or bearer token in summary.json stops finalization", () => {
  for (const leaked of ["192.168.1.20", "Authorization: Bearer abcdefghijklmnop"]) {
    const out = tmpDir("summary");
    const stage = writeStage(out, {
      "report.md": "# A safe report\n",
      "summary.json": JSON.stringify({ run_id: "j01", note: leaked }),
    });
    assert.throws(
      () => finalizeJourney(out, "", { stageDir: stage }),
      /summary\.json/,
      `a leak (${leaked}) written into summary.json must be refused at finalization`,
    );
    assert.ok(!fs.existsSync(path.join(out, "summary.json")), "nothing is promoted");
    assert.ok(!fs.existsSync(stage), "unpublishable staging is deleted");
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("the shareable set is an allowlist: no screenshots, no raw trees, even at the top level", () => {
  const out = tmpDir("set");
  const stage = writeStage(out, {
    "report.md": "# report\n",
    "summary.json": "{}\n",
    "drafts/issue-1.md": "# draft\n",
    "private/screens/01-home.png": "not really a png",
    "private/evidence.json": "{}",
    "private/tree-01.txt": "raw accessibility tree",
    "01-home.png": "a stray screenshot at the top level",
    "tree-02.txt": "a stray raw tree at the top level",
  });
  assert.deepEqual(shareableFiles(stage), ["report.md", "summary.json", path.join("drafts", "issue-1.md")]);
  for (const f of shareableFiles(stage)) {
    assert.doesNotMatch(f, /\.(png|jpe?g|webp|gif)$/i);
    assert.doesNotMatch(f, /tree-\d+\.txt$/);
  }
  fs.rmSync(out, { recursive: true, force: true });
});

test("a shareable file that carries a screenshot or raw-tree path is refused", () => {
  for (const line of ["- `private/screens/01-home.png`: Home", "Look in private/tree-01.txt"]) {
    const out = tmpDir("ref");
    const stage = writeStage(out, { "report.md": `# report\n\n${line}\n`, "summary.json": "{}\n" });
    assert.notDeepEqual(scanShareable(stage), [], `a shareable file naming ${line} must be refused`);
    assert.throws(() => finalizeJourney(out, "", { stageDir: stage }), /report\.md/);
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("a rendered report from a run with screenshots has no screenshot path and finalizes", () => {
  const run = {
    journey: { product: "Project Home", goal: "Find the one thing.", fixture_id: "project-home-mocked", budget: { seconds: 60 } },
    evidence: {
      started_at: "2026-10-30T12:00:00.000Z", wall_ms: 1000, desktop: { keys: { tabs: 1, enters: 0 } },
      oracle: { what_needs_me: { ok: true, expected: "q", found: ["q"] }, who_is_waiting: { ok: true, expected: ["a"], found: ["a"], missing: [] } },
      timeline: [{ ms: 1, step: "start", text: "Started." }], lookOnly: { blocked: [], reachedServer: [], refusedPresses: [] },
      guard: { armed: true }, unmocked: [], engine: { version: "1.0", desktop: "1280 by 800", phone: "390 by 844" },
      fixture: { identity_ok: true }, build: { label: "revision abc" },
    },
    findings: { cold: [], warm: [], unknowns: [] }, words: [], refs: {},
    shots: [{ file: "private/screens/01-home.png", what: "Home" }, { file: "private/screens/02-inbox.png", what: "Inbox" }],
  };
  const report = renderReport(run);
  assert.doesNotMatch(report, /\.(png|jpe?g|webp|gif)\b/i, "the shareable report must not name a screenshot");
  const out = tmpDir("rendered");
  const stage = writeStage(out, { "report.md": report, "summary.json": JSON.stringify({ verdict: "PASS" }) });
  scanShareable(stage);
  finalizeJourney(out, "", { stageDir: stage });
  assert.ok(fs.existsSync(path.join(out, "report.md")));
  fs.rmSync(out, { recursive: true, force: true });
});
