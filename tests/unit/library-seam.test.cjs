// The library seam: the six exports a game repo's own UAT command borrows to replay a recorded game behind this repo's guard
// (docs/research/domain-driver-replay.md, "Game decks"). This file pins their names and the options consumers pass.
// If a test here has to change, the change reaches other repos: say so in the PR, and update the consumers first.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SEAM = {
  "../../lib/journey/fixture-server.cjs": ["startFixtureServer", "verifyIdentity"],
  "../../lib/netpolicy.cjs": ["installCdpRequestPolicy", "installWebSocketPolicy"],
  "../../lib/policy.cjs": ["decideFixtureRequest"],
  "../../lib/artifacts.cjs": ["finalizeArtifacts"],
};
const { startFixtureServer, verifyIdentity } = require("../../lib/journey/fixture-server.cjs");
const { installCdpRequestPolicy, installWebSocketPolicy } = require("../../lib/netpolicy.cjs");
const { decideFixtureRequest } = require("../../lib/policy.cjs");
const { finalizeArtifacts } = require("../../lib/artifacts.cjs");

test("the six exports are functions, at the paths consumers load them from", () => {
  let n = 0;
  for (const [file, names] of Object.entries(SEAM)) {
    for (const name of names) {
      assert.equal(typeof require(file)[name], "function", `${name} from ${file.replace("../../", "")}`);
      n += 1;
    }
  }
  assert.equal(n, 6);
});

test("a consumer starts a fixture from a built app, checks who it is, and stops it, with the documented options only", async () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "uat-seam-"));
  fs.writeFileSync(path.join(dist, "index.html"), "<!doctype html><title>demo</title><h1>Demo</h1>");
  const s = await startFixtureServer({ distDir: dist, fixtureId: "demo-game" });
  try {
    assert.match(s.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(typeof s.nonce, "string");
    assert.ok(Array.isArray(s.requests));
    assert.deepEqual(s.mutations(), []);
    const body = await (await fetch(`${s.origin}/.well-known/uat-fixture`)).text();
    assert.equal(verifyIdentity(body, { fixtureId: "demo-game", nonce: s.nonce }).ok, true);
    assert.equal(verifyIdentity(body, { fixtureId: "demo-game", nonce: "other" }).ok, false);
  } finally { await s.stop(); fs.rmSync(dist, { recursive: true, force: true }); }
});

test("decideFixtureRequest: the fixture origin may be read; another origin, or a write, is stopped", () => {
  const fixtureOrigin = "http://127.0.0.1:4000";
  const decide = (url, method) => decideFixtureRequest({ url, method, fixtureOrigin, allowWrites: false }).action;
  assert.equal(decide("http://127.0.0.1:4000/index.html", "GET"), "continue");
  assert.equal(decide("http://127.0.0.1:4000/x", "POST"), "abort");
  assert.equal(decide("http://127.0.0.1:9/x", "GET"), "abort");
  assert.equal(decide("data:text/plain,hi", "GET"), "continue");
});

test("installCdpRequestPolicy takes a decide hook and an onBlock hook, and hands back attachPage", async () => {
  const sent = [];
  const handlers = {};
  const cdp = { on: (name, fn) => { handlers[name] = fn; }, send: async (method, params) => { sent.push([method, params]); } };
  const context = { pages: () => [], on: () => {}, newCDPSession: async () => cdp };
  const blocked = [];
  const policy = await installCdpRequestPolicy(context, {
    decide: ({ url, method }) => decideFixtureRequest({ url, method, fixtureOrigin: "http://127.0.0.1:4000", allowWrites: false }),
    onBlock: (b) => blocked.push(b),
  });
  assert.equal(typeof policy.attachPage, "function");
  await policy.attachPage({});
  assert.ok(sent.some(([m]) => m === "Fetch.enable"));
  handlers["Fetch.requestPaused"]({ requestId: "r1", resourceType: "Fetch", request: { url: "http://127.0.0.1:4000/save", method: "POST", headers: {} } });
  handlers["Fetch.requestPaused"]({ requestId: "r2", resourceType: "Document", request: { url: "http://127.0.0.1:4000/", method: "GET", headers: {} } });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(sent.some(([m, p]) => m === "Fetch.failRequest" && p.requestId === "r1"), "the write was failed");
  assert.ok(sent.some(([m, p]) => m === "Fetch.continueRequest" && p.requestId === "r2"), "the read was let through");
  assert.deepEqual(blocked.map((b) => [b.kind, b.method]), [["http", "POST"]]);
});

test("installWebSocketPolicy drops what a page sends and reports it; with readOnly off it installs nothing", async () => {
  let route = null;
  const context = { routeWebSocket: async (pattern, fn) => { route = { pattern, fn }; } };
  const blocked = [];
  await installWebSocketPolicy(context, { readOnly: true, onBlock: (b) => blocked.push(b) });
  assert.equal(route.pattern, "**/*");
  route.fn({ url: () => "ws://127.0.0.1:4000/live", onMessage: (cb) => cb("hello") });
  assert.deepEqual(blocked.map((b) => [b.kind, b.method, b.bytes]), [["websocket", "WS", 5]]);
  route = null;
  await installWebSocketPolicy(context, { readOnly: false });
  assert.equal(route, null);
});

test("finalizeArtifacts(outDir, secret, { stageDir }) promotes what was staged and removes the staging directory", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "uat-seam-out-"));
  const stage = path.join(out, ".staging");
  fs.mkdirSync(stage, { recursive: true });
  fs.writeFileSync(path.join(stage, "report.json"), "{}");
  finalizeArtifacts(out, "", { stageDir: stage, redact: () => ({ scanned: 1, changed: 0 }) });
  assert.ok(fs.existsSync(path.join(out, "report.json")));
  assert.ok(!fs.existsSync(stage));
  fs.rmSync(out, { recursive: true, force: true });
});
