"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { startFixtureServer, verifyIdentity } = require("../../lib/journey/fixture-server.cjs");

function dist() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "uat-fx-"));
  fs.writeFileSync(path.join(d, "index.html"), "<!doctype html><title>demo</title><h1>Demo</h1>");
  fs.writeFileSync(path.join(d, "app.js"), "console.log(1)");
  return d;
}

test("fixture server: serves the built app, falls back to index.html, binds loopback only", async () => {
  const d = dist();
  const s = await startFixtureServer({ distDir: d, routes: {}, fixtureId: "demo" });
  try {
    assert.match(s.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.match(await (await fetch(`${s.origin}/`)).text(), /Demo/);
    assert.match(await (await fetch(`${s.origin}/some/deep/link`)).text(), /Demo/);
    assert.equal(await (await fetch(`${s.origin}/app.js`)).text(), "console.log(1)");
  } finally { await s.stop(); fs.rmSync(d, { recursive: true, force: true }); }
});

test("fixture server: answers canned api routes, records unknown calls as 404", async () => {
  const d = dist();
  const s = await startFixtureServer({ distDir: d, routes: { "/api/home": { n: 2 } }, fixtureId: "demo" });
  try {
    assert.deepEqual(await (await fetch(`${s.origin}/api/home`)).json(), { n: 2 });
    const miss = await fetch(`${s.origin}/api/nope`);
    assert.equal(miss.status, 404);
    assert.deepEqual(s.unmocked(), ["GET /api/nope"]);
  } finally { await s.stop(); fs.rmSync(d, { recursive: true, force: true }); }
});

test("fixture server: a write that reaches it is refused (405) and recorded as a mutation", async () => {
  const d = dist();
  const s = await startFixtureServer({ distDir: d, routes: { "/api/decisions": [] }, fixtureId: "demo" });
  try {
    const r = await fetch(`${s.origin}/api/decisions/41/resolve`, { method: "POST", body: "{}" });
    assert.equal(r.status, 405);
    assert.deepEqual(s.mutations().map((m) => `${m.method} ${m.path}`), ["POST /api/decisions/41/resolve"]);
  } finally { await s.stop(); fs.rmSync(d, { recursive: true, force: true }); }
});

test("fixture server: says who it is, and verifyIdentity rejects a wrong id or nonce", async () => {
  const d = dist();
  const s = await startFixtureServer({ distDir: d, routes: {}, fixtureId: "demo", nonce: "n-1" });
  try {
    const body = await (await fetch(`${s.origin}/.well-known/uat-fixture`)).text();
    assert.equal(verifyIdentity(body, { fixtureId: "demo", nonce: "n-1" }).ok, true);
    assert.match(verifyIdentity(body, { fixtureId: "demo", nonce: "other" }).reason, /nonce/);
    assert.match(verifyIdentity(body, { fixtureId: "other", nonce: "n-1" }).reason, /fixture_id/);
    assert.equal(verifyIdentity("not json", { fixtureId: "demo", nonce: "n-1" }).ok, false);
  } finally { await s.stop(); fs.rmSync(d, { recursive: true, force: true }); }
});

test("fixture server: refuses to start without a built app, and path traversal is refused", async () => {
  await assert.rejects(startFixtureServer({ distDir: os.tmpdir() + "/definitely-not-here", fixtureId: "x" }), /no built app/);
  const d = dist();
  const s = await startFixtureServer({ distDir: d, routes: {}, fixtureId: "demo" });
  try {
    const r = await fetch(`${s.origin}/..%2f..%2fetc%2fpasswd`);
    assert.ok(r.status === 403 || /Demo/.test(await r.text()), "never serves a file outside the app");
  } finally { await s.stop(); fs.rmSync(d, { recursive: true, force: true }); }
});
