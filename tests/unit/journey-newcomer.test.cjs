"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { canPress, cueScore } = require("../../lib/journey/newcomer.cjs");

const link = { tag: "a", href: "/inbox", name: "Inbox, 2 waiting", region: "" };
const disclosure = { tag: "button", expanded: "false", name: "Approve the plan?", region: "Waiting on you" };
const answer = { tag: "button", expanded: null, name: "Approve the plan (Recommended)", region: "Waiting on you" };

test("the newcomer may press a link and a disclosure, and nothing else", () => {
  assert.equal(canPress(link).ok, true);
  assert.equal(canPress({ tag: "summary", name: "Later" }).ok, true);
  assert.equal(canPress(disclosure).ok, true);
  assert.equal(canPress({ tag: "div", role: "button", expanded: "true", name: "x" }).ok, true);
});

test("the newcomer refuses a control that could answer, send, clear or withdraw", () => {
  for (const d of [answer, { tag: "button", expanded: null, name: "Clear notices" }, { tag: "input", type: "submit", name: "Send" },
    { tag: "button", role: "button", expanded: null, name: "Withdraw" }, { tag: "a", href: null, name: "anchor with no href" }, null]) {
    const r = canPress(d);
    assert.equal(r.ok, false, JSON.stringify(d));
  }
  assert.match(canPress(answer).why, /look-only/);
});

test("cueScore: matches the accessible name, case-insensitively, and ranks earlier cues higher", () => {
  const cues = ["waiting for you", "inbox"];
  assert.ok(cueScore({ name: "2 WAITING FOR YOU" }, { cues }) > cueScore({ name: "Inbox" }, { cues }));
  assert.equal(cueScore({ name: "Gallery" }, { cues }), 0);
  assert.equal(cueScore(null, { cues }), 0);
});

test("cueScore: a region cue matches the section the control sits in", () => {
  assert.ok(cueScore(disclosure, { regionCues: ["waiting on you"] }) > 0);
  assert.equal(cueScore({ name: "Find", region: "Hotbar" }, { regionCues: ["waiting on you"] }), 0);
});
