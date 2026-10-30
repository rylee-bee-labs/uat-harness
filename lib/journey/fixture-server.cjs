// A loopback fixture server for journeys: serves a BUILT web app (static, SPA fallback) and answers /api/*
// from a table of canned, fictional responses. Binds 127.0.0.1 only, on a free port the OS picks.
//
// Why it exists: a journey must never touch a live product. The fixture is the only origin the browser may
// reach (see decideFixtureRequest in lib/policy.cjs). It records every request so a run can prove that
// nothing but GETs arrived, and it says who it is (`/.well-known/uat-fixture`) so a run can refuse a target
// that is not the fixture it started.
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".woff": "font/woff", ".webmanifest": "application/manifest+json", ".txt": "text/plain",
};

function jsonReply(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text), "Cache-Control": "no-store" });
  res.end(text);
}

// routes: { "/api/path": body } answers GET (and HEAD). A function value is called with the URL and returns a body.
async function startFixtureServer({ distDir, routes = {}, fixtureId, nonce = crypto.randomUUID(), host = "127.0.0.1", port = 0 }) {
  if (!distDir || !fs.existsSync(path.join(distDir, "index.html"))) {
    throw new Error(`fixture: no built app at the given dist directory (index.html missing)`);
  }
  const root = path.resolve(distDir);
  const requests = [];
  const sse = new Set();

  const server = http.createServer((req, res) => {
    const method = String(req.method || "GET").toUpperCase();
    let url;
    try { url = new URL(req.url, "http://fixture.invalid"); } catch (_) { res.writeHead(400); res.end(); return; }
    const p = url.pathname;
    const rec = (extra) => requests.push({ method, path: p, ...extra });

    if (p === "/.well-known/uat-fixture") {
      rec({ kind: "identity" });
      return jsonReply(res, 200, { fixture_id: fixtureId, nonce });
    }

    if (p.startsWith("/api/")) {
      if (method !== "GET" && method !== "HEAD") {
        // The browser guard should have stopped this. If one arrives, it is recorded loudly and refused.
        rec({ kind: "api", mocked: false, refused: true });
        return jsonReply(res, 405, { error: "the fixture is look-only" });
      }
      if (p === "/api/events" || p === "/api/live") {
        rec({ kind: "api", mocked: true, stream: true });
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
        res.write(":\n\n");
        sse.add(res);
        res.on("close", () => sse.delete(res));
        return;
      }
      if (Object.prototype.hasOwnProperty.call(routes, p)) {
        rec({ kind: "api", mocked: true });
        const v = routes[p];
        return jsonReply(res, 200, typeof v === "function" ? v(url) : v);
      }
      rec({ kind: "api", mocked: false });
      return jsonReply(res, 404, { error: "not in fixture", path: p });
    }

    let pathname = "/";
    try { pathname = decodeURIComponent(p); } catch (_) { /* keep / */ }
    let file = path.join(root, pathname);
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end("forbidden"); return; }
    let spa = false;
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { file = path.join(root, "index.html"); spa = true; }
    rec({ kind: "static", spa });
    const body = fs.readFileSync(file);
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Content-Length": body.length });
    res.end(method === "HEAD" ? undefined : body);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const origin = `http://${host}:${server.address().port}`;

  return {
    origin, nonce, fixtureId, requests,
    // Mutating requests that reached the server at all (the guard's backstop: should always be empty).
    mutations: () => requests.filter((r) => r.method !== "GET" && r.method !== "HEAD"),
    unmocked: () => requests.filter((r) => r.kind === "api" && !r.mocked).map((r) => `${r.method} ${r.path}`),
    stop: () => new Promise((resolve) => {
      for (const res of sse) { try { res.end(); } catch (_) { /* closing */ } }
      server.close(() => resolve());
      if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    }),
  };
}

// The identity check a run makes before it trusts a target: wrong id or wrong nonce means "not my fixture".
function verifyIdentity(body, { fixtureId, nonce }) {
  let j;
  try { j = typeof body === "string" ? JSON.parse(body) : body; } catch (_) { return { ok: false, reason: "identity reply is not JSON" }; }
  if (!j || j.fixture_id !== fixtureId) return { ok: false, reason: "wrong fixture_id" };
  if (j.nonce !== nonce) return { ok: false, reason: "wrong nonce" };
  return { ok: true, reason: "fixture identified itself" };
}

module.exports = { startFixtureServer, verifyIdentity };
