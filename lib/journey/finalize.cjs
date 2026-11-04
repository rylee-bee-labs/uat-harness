// Finalize a journey run: decide which staged files are shareable, refuse to publish one that would
// leak, then hand the staging directory to the artifact finalizer (redact, then promote, fail closed).
//
// The shareable set is an ALLOWLIST, not "everything outside private/" (spec §10.4): text summaries
// only. Screenshots, raw accessibility trees and the evidence dump stay under private/ and are never
// shareable, even if a future step writes one at the top level by mistake.
"use strict";

const fs = require("fs");
const path = require("path");
const { findUnsafe } = require("./report.cjs");
const { finalizeArtifacts, stageDirFor } = require("../artifacts.cjs");

const SHAREABLE_NAMES = ["report.md", "summary.json"];

// The files in `stageDir` that make up the shareable set. Pure allowlist; anything else staged is private.
function shareableFiles(stageDir) {
  const out = [];
  if (!fs.existsSync(stageDir)) return out;
  for (const name of SHAREABLE_NAMES) {
    if (fs.existsSync(path.join(stageDir, name))) out.push(name);
  }
  const drafts = path.join(stageDir, "drafts");
  if (fs.existsSync(drafts)) {
    for (const name of fs.readdirSync(drafts).sort()) {
      if (name.endsWith(".md") && fs.statSync(path.join(drafts, name)).isFile()) out.push(path.join("drafts", name));
    }
  }
  return out;
}

// Reasons the shareable text would leak ([] means safe). Today this checks report.md only.
function scanShareable(stageDir) {
  const bad = [];
  const reportPath = path.join(stageDir, "report.md");
  if (fs.existsSync(reportPath)) {
    for (const reason of findUnsafe(fs.readFileSync(reportPath, "utf8"))) bad.push(`report.md: ${reason}`);
  }
  return bad;
}

// Scan first: if any shareable file would leak, throw before a single file is promoted.
function finalizeJourney(outDir, secret, opts = {}) {
  const stageDir = opts.stageDir || stageDirFor(outDir);
  const unsafe = scanShareable(stageDir);
  if (unsafe.length) throw new Error(`the shareable artifacts would publish ${unsafe.join(" and ")}; withheld (fail closed)`);
  return finalizeArtifacts(outDir, secret, { stageDir });
}

module.exports = { shareableFiles, scanShareable, finalizeJourney, SHAREABLE_NAMES };
