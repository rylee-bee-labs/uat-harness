// The model newcomer's pure parts: what counts as a choice, where screenshots may go, what the model is told.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseChoice, isLoopback, buildPrompt, replySchema } = require("../../lib/journey/model-player.cjs");

const V = ["1", "2", "3", "12"];

test("a choice is a bare number on screen", () => {
  for (const [reply, number] of [["2", "2"], [" 3 ", "3"], ["12", "12"], ['"2"', "2"]]) assert.deepEqual(parseChoice(reply, V), { kind: "press", number }, reply);
});

test("a number that is not on screen is invalid, never a nearby guess", () => {
  assert.equal(parseChoice("7", V).kind, "invalid");
});

test("prose is no choice, even when it names exactly one control", () => {
  for (const reply of ["", "Looking at the page, I see a list.", "Either 1 or 2 would work.", "Home has the number 2.", "I would press 12 next.", "ANSWER: 2"]) {
    assert.equal(parseChoice(reply, V).kind, "none", reply);
  }
});

test("DONE and GIVE UP end a trial", () => {
  assert.equal(parseChoice("DONE", V).kind, "done");
  assert.equal(parseChoice("done.", V).kind, "done");
  assert.equal(parseChoice("Give up", V).kind, "give-up");
});

test("screenshots may only go to this machine", () => {
  for (const u of ["http://127.0.0.1:8830", "http://localhost:1234/x", "http://[::1]:8830"]) assert.equal(isLoopback(u), true, u);
  for (const u of ["https://ollama.com/v1", "http://192.168.2.5:8080", "http://127.0.0.1.evil.example/", "nonsense", ""]) assert.equal(isLoopback(u), false, u);
});

test("the prompt carries the goal and what just happened, and nothing else about the run", () => {
  const p = buildPrompt({ goal: "Find the one thing waiting on me.", lastResult: 'You pressed "Inbox".' });
  assert.match(p, /Find the one thing waiting on me\./);
  assert.match(p, /You pressed "Inbox"\./);
  assert.doesNotMatch(p, /oracle|planted|moss-agent|selector/i);
});

test("the reply format allows the numbers on this screen, DONE and GIVE UP, and nothing else", () => {
  assert.deepEqual(replySchema(["1", "2"]).json_schema.schema.enum, ["1", "2", "DONE", "GIVE UP"]);
});
