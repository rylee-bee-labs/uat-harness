"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildFindings, findWords, tabsBeforeMain, numberBefore } = require("../../lib/journey/findings.cjs");

const measure = (over = {}) => ({
  bodyText: "", firstScreenText: "", firstScreenWordCount: 10, viewport: { w: 1280, h: 800 }, overflowX: false,
  smallTargets: [], runningInfiniteAnimations: [], interactiveCount: 5, scrollW: 1280, clientW: 1280, ...over,
});
const stops = (n, inMainAt) => Array.from({ length: n }, (_, i) => ({ name: `stop ${i}`, inMain: i >= inMainAt }));
const clean = () => ({
  planted: { question: "Approve the plan?", asker: "moss-agent" },
  oracle: { what_needs_me: { ok: true, expected: "q" }, who_is_waiting: { ok: true, expected: ["moss-agent"], found: ["moss-agent"], missing: [] } },
  desktop: {
    home: { measure: measure({ bodyText: "2\nwaiting for you Approve the plan?" }) },
    inbox: { measure: measure({ bodyText: "Decisions first. Notices below. Waiting on you · 2 (Recommended)" }) },
    steps: [{ found: true, tabs: 2, stops: [{ name: "Skip to content", inMain: false }], target: { desc: { name: "Inbox, 2 waiting" } } }, { found: true, tabs: 1, stops: stops(1, 0) }],
    axe: { Home: [], Inbox: [] }, keys: { tabs: 3, enters: 2 },
  },
  phone: { home: { measure: measure({ viewport: { w: 390, h: 844 } }), cue: { y: 230, h: 44, w: 300 } }, inbox: { measure: measure(), questionVisible: true } },
  lookOnly: { blocked: [], reachedServer: [], refusedPresses: [] }, console: { errors: [], pageErrors: [] }, words: [],
});

test("a clean journey finds no cold spots and says why things are warm", () => {
  const f = buildFindings(clean(), {});
  assert.deepEqual(f.cold.map((c) => c.id), []);
  assert.ok(f.warm.some((w) => w.id === "motion-calm"));
  assert.ok(f.warm.some((w) => w.id === "targets-44"));
  assert.ok(f.warm.some((w) => w.id === "look-only-held"));
});

test("who is waiting missing is the top cold spot", () => {
  const ev = clean();
  ev.oracle.who_is_waiting = { ok: false, expected: ["moss-agent"], found: [], missing: ["moss-agent"] };
  const f = buildFindings(ev, {});
  assert.equal(f.cold[0].id, "who-not-shown");
  assert.match(f.cold[0].what, /moss-agent/);
});

test("home that only counts, never names the item, is a cold spot", () => {
  const ev = clean();
  ev.desktop.home.measure.bodyText = "2 waiting for you";
  assert.ok(buildFindings(ev, {}).cold.some((c) => c.id === "home-counts-not-items"));
});

test("no skip link plus many stops before content is a cold spot; a skip link is not", () => {
  const ev = clean();
  ev.desktop.steps = [{ found: true, tabs: 6, stops: stops(6, 99), target: { desc: { name: "Inbox" } } }, { found: true, tabs: 15, stops: stops(15, 13) }];
  const f = buildFindings(ev, {});
  const c = f.cold.find((x) => x.id === "no-skip-link");
  assert.ok(c);
  assert.match(c.title, /13 Tab stops/);
  assert.equal(buildFindings(clean(), {}).cold.some((x) => x.id === "no-skip-link"), false);
});

test("small targets, sideways scroll and motion under reduce are cold spots", () => {
  const ev = clean();
  ev.phone.home.measure.smallTargets = [{ name: "x", w: 30, h: 30 }];
  ev.phone.home.measure.overflowX = true;
  ev.desktop.home.measure.runningInfiniteAnimations = ["pulse"];
  const ids = buildFindings(ev, {}).cold.map((c) => c.id);
  assert.ok(ids.includes("small-targets") && ids.includes("sideways-scroll") && ids.includes("motion-under-reduce"));
});

test("a phone first screen that hides the cue is a cold spot", () => {
  const ev = clean();
  ev.phone.home.cue = { y: 900, h: 44, w: 300 };
  assert.ok(buildFindings(ev, {}).cold.some((c) => c.id === "phone-first-screen"));
});

test("disagreeing counts are a cold spot; agreeing counts are warm", () => {
  const ev = clean();
  ev.desktop.inbox.measure.bodyText = "Waiting on you · 3";
  assert.ok(buildFindings(ev, {}).cold.some((c) => c.id === "counts-disagree"));
  assert.ok(buildFindings(clean(), {}).warm.some((w) => w.id === "counts-agree"));
});

test("axe serious violations become one cold spot per screen, critical ranks highest", () => {
  const ev = clean();
  ev.desktop.axe.Inbox = [{ id: "label", impact: "critical", help: "Form elements must have labels", count: 1, clause: "form fields need a label", first: { target: "#x" } }];
  const f = buildFindings(ev, {});
  assert.equal(f.cold[0].id, "axe-Inbox");
  assert.equal(f.cold[0].severity, 3);
});

test("cold spots are ranked by severity", () => {
  const ev = clean();
  ev.desktop.home.measure.bodyText = "2 waiting for you";
  ev.oracle.who_is_waiting = { ok: false, expected: ["a"], found: [], missing: ["a"] };
  const sev = buildFindings(ev, {}).cold.map((c) => c.severity);
  assert.deepEqual(sev, [...sev].sort((a, b) => b - a));
});

test("findWords: only words actually on a screen, with where", () => {
  const w = findWords({ Home: "Welcome to the Estate. Tools", Inbox: "Look later" }, { Estate: "all the projects", "Look later": "snooze", Party: "agents" });
  assert.deepEqual(w.map((x) => [x.term, x.screens]), [["Estate", ["Home"]], ["Look later", ["Inbox"]]]);
});

test("helpers", () => {
  assert.equal(tabsBeforeMain([{ inMain: false }, { inMain: false }, { inMain: true }]), 2);
  assert.equal(tabsBeforeMain([{ inMain: false }]), null);
  assert.equal(numberBefore("Waiting on you · 7", /waiting on you\s*·\s*(\d+)/i), 7);
});
