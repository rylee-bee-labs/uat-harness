// A tiny stand-in product for the journey fixtures: a built "app" (one index.html), a journey file, seed data.
// It carries two traps on purpose: the page POSTs on every load (the guard must stop it) and the Inbox has an
// "Approve now" button that writes (the newcomer must refuse to press it).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

function html({ question, asker }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Demo Home</title></head><body>
<nav aria-label="Primary"><a href="/">Home</a> <a href="/inbox">Inbox, 1 waiting</a></nav>
<main id="m"></main>
<script>
fetch("/api/track", { method: "POST", body: "{}" }).catch(function () {});
var m = document.getElementById("m");
if (location.pathname === "/inbox") {
  m.innerHTML = '<h1>Inbox</h1><section aria-label="Waiting on you"><h2>Waiting on you \\u00b7 1</h2>' +
    '<button id="approve" type="button">Approve now</button>' +
    '<button id="card" type="button" aria-expanded="false">\\u25b8 ${question}</button>' +
    '<div id="body" hidden>${asker ? "from moss-agent" : "filed 1h ago"}</div></section>';
  document.getElementById("approve").onclick = function () { fetch("/api/resolve", { method: "POST", body: "{}" }); };
  var c = document.getElementById("card");
  c.onclick = function () { var o = c.getAttribute("aria-expanded") === "true"; c.setAttribute("aria-expanded", String(!o)); document.getElementById("body").hidden = o; };
} else {
  m.innerHTML = '<h1>Home</h1><p><a href="/inbox">1 waiting for you</a></p>';
}
</script></body></html>`;
}

function makeDemo({ asker = true, question = "Approve the demo plan?", build = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "uat-demo-"));
  const dist = path.join(root, "dist");
  fs.mkdirSync(dist);
  if (build) fs.writeFileSync(path.join(dist, "index.html"), html({ question, asker }));
  const jdir = path.join(root, "journey");
  fs.mkdirSync(jdir);
  fs.writeFileSync(path.join(jdir, "fixture-data.cjs"), `module.exports = {
  FIXTURE_ID: "demo-home",
  buildFixture() { return { routes: {}, planted: { question: "Approve the demo plan?", asker: "moss-agent", project: "Demo" } }; },
};\n`);
  fs.writeFileSync(path.join(jdir, "jargon.json"), JSON.stringify({ terms: { Inbox: "where things land" } }));
  fs.writeFileSync(path.join(jdir, "journey.json"), JSON.stringify({
    id: "demo", product: "Demo Home", fixture_id: "demo-home", goal: "Find the one thing waiting on me.",
    persona: { name: "demo", desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 }, reduced_motion: "reduce" },
    budget: { seconds: 60, max_tabs_per_step: 20 },
    steps: [
      { id: "find-waiting", say: "Find what is waiting", cues: ["waiting for you", "waiting on you", "inbox"] },
      { id: "open-first-item", say: "Open the first thing", region_cues: ["waiting on you"], needs_disclosure: true },
    ],
    oracle: { what_needs_me: "{planted.question}", who_is_waiting: ["{planted.asker}"] },
    jargon_file: "jargon.json", source_hints: {},
  }));
  return { root, dist, journey: path.join(jdir, "journey.json"), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

module.exports = { makeDemo };
