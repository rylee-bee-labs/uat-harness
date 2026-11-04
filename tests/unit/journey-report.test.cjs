"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { renderReport, findUnsafe, verdictOf, isPartial, withheldReasons } = require("../../lib/journey/report.cjs");

function run(over = {}) {
  return {
    journey: { product: "Project Home", goal: "Find the one thing.", fixture_id: "project-home-mocked", budget: { seconds: 60 } },
    evidence: {
      started_at: "2026-10-30T12:00:00.000Z", wall_ms: 12500, desktop: { keys: { tabs: 21, enters: 2 } },
      oracle: { what_needs_me: { ok: true, expected: "Approve the plan?" }, who_is_waiting: { ok: false, expected: ["moss-agent"], found: [], missing: ["moss-agent"] } },
      timeline: [{ ms: 100, step: "start", text: "Started." }, { ms: 4000, step: "look", text: "Home is open." }],
      lookOnly: { blocked: [{ kind: "http", method: "POST", path: "http://127.0.0.1:1/api/x", reason: "look-only: POST HTTP method blocked" }], reachedServer: [], refusedPresses: [{ name: "Approve" }] },
      guard: { armed: true }, unmocked: [], engine: { version: "1.0", desktop: "1280 by 800", phone: "390 by 844" }, fixture: { identity_ok: true }, build: { label: "revision abc" },
    },
    findings: {
      cold: [{ id: "a", severity: 3, title: "Cold one", screen: "Inbox", what: "w", why: "y", suggestion: "s", next: "Agent." }],
      warm: [{ id: "w1", title: "Warm one", text: "because" }], unknowns: ["A person was not timed."],
    },
    words: [{ term: "Estate", gloss: "all projects", screens: ["Home (first screen)"] }], refs: {}, shots: [{ file: "private/screens/01.png", what: "Home" }],
    ...over,
  };
}

test("the report has every section a newcomer report needs, in order", () => {
  const md = renderReport(run());
  const heads = md.split("\n").filter((l) => l.startsWith("## ")).map((l) => l.slice(3));
  assert.deepEqual(heads, ["At a glance", "Did I get there?", "The timed log", "Warm moments", "Cold spots (ranked)", "Words a newcomer wouldn't know",
    "Look-only check", "Coverage receipt", "Screenshots", "UNKNOWN"]);
});

test("the top of the report answers: got there, top cold spots, who acts next", () => {
  const md = renderReport(run());
  const glance = md.split("## At a glance")[1].split("## Did I get there?")[0];
  assert.match(glance, /Got there\? FAIL\.\*\* I found the one thing\. I could not find who/);
  assert.match(glance, /Cold one/);
  assert.match(glance, /Who acts next:\*\* Agent\./);
});

test("unobserved things are named UNKNOWN, never implied", () => {
  const md = renderReport(run());
  assert.match(md, /Physical phone: \*\*UNKNOWN, not observed/);
  assert.match(md, /Real screen reader.*UNKNOWN, not observed/);
  assert.match(md, /A person doing the journey: \*\*UNKNOWN/);
  assert.match(md, /Findings are evidence, not pass\/fail\./);
});

test("verdict: both halves is PASS, one half is FAIL and partial, neither is FAIL, no oracle is UNKNOWN", () => {
  const ok = (v) => ({ ok: v });
  assert.equal(verdictOf({ what_needs_me: ok(true), who_is_waiting: ok(true) }), "PASS");
  assert.equal(verdictOf({ what_needs_me: ok(true), who_is_waiting: ok(false) }), "FAIL");
  assert.equal(isPartial({ what_needs_me: ok(true), who_is_waiting: ok(false) }), true);
  assert.equal(verdictOf({ what_needs_me: ok(false), who_is_waiting: ok(true) }), "FAIL");
  assert.equal(isPartial({ what_needs_me: ok(false), who_is_waiting: ok(true) }), false);
  assert.equal(verdictOf(null), "UNKNOWN");
  assert.equal(verdictOf({}), "UNKNOWN");
});

test("findUnsafe catches every private range and any-address forms, and not their neighbours", () => {
  for (const bad of ["172.16.0.1", "172.31.255.9", "172.20.1.1", "http://0.0.0.0:8080/", "http://[::1]:8080/"]) {
    assert.ok(findUnsafe(`at ${bad}`).length, bad);
  }
  for (const fine of ["172.15.0.1", "172.32.0.1", "8.8.8.8"]) assert.deepEqual(findUnsafe(`at ${fine}`), [], fine);
});

test("a summary is checked as well as the report", () => {
  const report = "nothing private here";
  assert.deepEqual(withheldReasons({ report, summary: { journey: "x" } }), []);
  assert.ok(withheldReasons({ report, summary: { cold: [{ title: "seen at 192.168.1.20" }] } }).length);
  assert.ok(withheldReasons({ report: "host 192.168.1.20", summary: {} }).length);
});

test("the look-only section counts blocked writes and writes that reached the server", () => {
  const md = renderReport(run());
  assert.match(md, /Write attempts blocked in the browser: \*\*1\*\*/);
  assert.match(md, /Writes that reached the local copy's server: \*\*0\*\*/);
  assert.match(md, /chose not to press: "Approve"/);
});

test("a report built from a normal run is public-safe", () => {
  assert.deepEqual(findUnsafe(renderReport(run())), []);
});

test("findUnsafe catches real ports, machine paths, private addresses, private hosts and bearer tokens", () => {
  assert.ok(findUnsafe("open http://127.0.0.1:8123/x").length);
  assert.ok(findUnsafe("see /var/home/someone/x").length);
  assert.ok(findUnsafe("at /home/someone/code").length);
  assert.ok(findUnsafe("host 192.168.1.20").length);
  assert.ok(findUnsafe("nas.example.lan").length);
  assert.ok(findUnsafe("Authorization: Bearer abcdefghijklmnop").length);
  assert.deepEqual(findUnsafe("http://127.0.0.1:PORT/ is fine as a placeholder and web/src/App.tsx:5 is a repo path"), []);
});
