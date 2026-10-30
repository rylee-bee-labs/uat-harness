"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { decideFixtureRequest } = require("../../lib/policy.cjs");

const O = "http://127.0.0.1:8790";

test("fixture policy: a same-origin read continues", () => {
  assert.equal(decideFixtureRequest({ url: `${O}/api/home`, method: "GET", fixtureOrigin: O }).action, "continue");
  assert.equal(decideFixtureRequest({ url: `${O}/`, method: "HEAD", fixtureOrigin: O }).action, "continue");
});

test("fixture policy: look-only blocks every write method, even on the fixture origin", () => {
  for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
    const d = decideFixtureRequest({ url: `${O}/api/decisions/41/resolve`, method: m, fixtureOrigin: O });
    assert.equal(d.action, "abort", m);
    assert.match(d.reason, /look-only/);
  }
});

test("fixture policy: anything off the fixture origin is refused, including another port on the same host", () => {
  assert.equal(decideFixtureRequest({ url: "http://127.0.0.1:8791/", method: "GET", fixtureOrigin: O }).action, "abort");
  assert.equal(decideFixtureRequest({ url: "https://example.test/x.png", method: "GET", fixtureOrigin: O }).action, "abort");
  assert.match(decideFixtureRequest({ url: "https://example.test/", method: "GET", fixtureOrigin: O }).reason, /off-origin/);
});

test("fixture policy: inline data and blob resources carry no network request", () => {
  assert.equal(decideFixtureRequest({ url: "data:image/png;base64,AA", method: "GET", fixtureOrigin: O }).action, "continue");
  assert.equal(decideFixtureRequest({ url: "blob:http://127.0.0.1:8790/abc", method: "GET", fixtureOrigin: O }).action, "continue");
});

test("fixture policy: an unparseable url is refused", () => {
  assert.equal(decideFixtureRequest({ url: "not a url", method: "GET", fixtureOrigin: O }).action, "abort");
});

test("fixture policy: writes stay blocked unless allowWrites is set explicitly (no journey sets it in Phase 1)", () => {
  assert.equal(decideFixtureRequest({ url: `${O}/api/x`, method: "POST", fixtureOrigin: O }).action, "abort");
  assert.equal(decideFixtureRequest({ url: `${O}/api/x`, method: "POST", fixtureOrigin: O, allowWrites: true }).action, "continue");
});
