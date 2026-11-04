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

// Raw evidence is never shareable, and a shareable text may not point at it either.
const SCREENSHOT_PATH_RE = /\b[\w./-]*\.(?:png|jpe?g|webp|gif)\b/i;
const RAW_TREE_PATH_RE = /\btree-\d+\.txt\b/;

// Reasons the shareable text would leak ([] means safe). Every shareable file is scanned, not just
// report.md: an unreviewed summary.json is as publishable as the report.
function scanShareable(stageDir) {
  const bad = [];
  for (const name of shareableFiles(stageDir)) {
    const text = fs.readFileSync(path.join(stageDir, name), "utf8");
    for (const reason of findUnsafe(text)) bad.push(`${name}: ${reason}`);
    if (SCREENSHOT_PATH_RE.test(text)) bad.push(`${name}: a screenshot path`);
    if (RAW_TREE_PATH_RE.test(text)) bad.push(`${name}: a raw accessibility tree path`);
  }
  return bad;
}

// Scan first: if any shareable file would leak, throw before a single file is promoted.
function finalizeJourney(outDir, secret, opts = {}) {
  const stageDir = opts.stageDir || stageDirFor(outDir);
  const unsafe = scanShareable(stageDir);
  if (unsafe.length) {
    // Fail closed: an unpublishable run leaves no staged artifacts behind.
    try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch (_) { /* best effort */ }
    throw new Error(`the shareable artifacts would publish ${unsafe.join(" and ")}; withheld (fail closed)`);
  }
  return finalizeArtifacts(outDir, secret, { stageDir });
}

module.exports = { shareableFiles, scanShareable, finalizeJourney, SHAREABLE_NAMES };
