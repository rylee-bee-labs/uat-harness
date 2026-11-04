// Browser-free tests for the Playwright glue in lib/netpolicy.cjs: the cases a
// browser would otherwise be needed to see (a popup, a redirect hop, an inline
// document) are replayed as the CDP events the glue handles.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { installCdpRequestPolicy } = require("../../lib/netpolicy.cjs");
const { decideFixtureRequest } = require("../../lib/policy.cjs");

const O = "http://127.0.0.1:8790";
const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

// A fake page + CDP session: enough of both for installCdpRequestPolicy, and a
// `sent` log so a test can see exactly which protocol call answered a request.
function harness() {
  const sent = [];
  const blocked = [];
  const handlers = {};
  const cdp = {
    on: (name, fn) => { handlers[name] = fn; },
    send: async (method, params) => { sent.push({ method, params }); },
  };
  const context = {
    pages: () => [],
    on: () => {},
    newCDPSession: async () => cdp,
  };
  const ready = installCdpRequestPolicy(context, {
    onBlock: (b) => blocked.push(b),
    // Mirrors uat_journey.cjs exactly: the hook does NOT forward isNavigation.
    decide: ({ url, method }) => decideFixtureRequest({ url, method, fixtureOrigin: O, allowWrites: false }),
  });
  return { sent, blocked, handlers, ready };
}

function fakePage({ opener = null, closed = () => {} } = {}) {
  return {
    opener: async () => opener,
    close: async () => { closed(); },
  };
}

function pause(handlers, ev) {
  handlers["Fetch.requestPaused"]({
    requestId: ev.id,
    resourceType: ev.resourceType || "Document",
    redirectedRequestId: ev.redirectedRequestId,
    request: { url: ev.url, method: ev.method || "GET", headers: {} },
  });
}

const sentFor = (sent, method, id) => sent.some((s) => s.method === method && s.params.requestId === id);

test("popup: a main-frame navigation off the fixture is refused AND the popup is closed", async () => {
  const h = harness();
  const policy = await h.ready;
  let closed = false;
  const popup = fakePage({ opener: {}, closed: () => { closed = true; } });
  await policy.attachPage(popup);

  pause(h.handlers, { id: "p1", url: "http://evil.test/away" });
  await tick();

  assert.ok(sentFor(h.sent, "Fetch.failRequest", "p1"), "the off-origin popup navigation is failed");
  assert.equal(closed, true, "the popup is closed, not left sitting on an error page");
  assert.deepEqual(h.blocked.map((b) => [b.kind, b.method]), [["http", "GET"]]);
});

test("popup: the run's own page (no opener) is never closed when a navigation is refused", async () => {
  const h = harness();
  const policy = await h.ready;
  let closed = false;
  const page = fakePage({ opener: null, closed: () => { closed = true; } });
  await policy.attachPage(page);

  pause(h.handlers, { id: "m1", url: "http://evil.test/away" });
  await tick();

  assert.ok(sentFor(h.sent, "Fetch.failRequest", "m1"));
  assert.equal(closed, false, "the run's own page stays open so the run can carry on");
});

test("redirect: an allowed origin that 302s off-origin is not followed into that origin", async () => {
  const h = harness();
  const policy = await h.ready;
  let closed = false;
  const popup = fakePage({ opener: {}, closed: () => { closed = true; } });
  await policy.attachPage(popup);

  // First hop: the fixture answers 302.
  pause(h.handlers, { id: "r1", url: `${O}/start` });
  await tick();
  assert.ok(sentFor(h.sent, "Fetch.continueRequest", "r1"), "the approved first request is continued");

  // Second hop: Chrome pauses the redirect target as a new paused request.
  pause(h.handlers, { id: "r2", url: "http://evil.test/landing", redirectedRequestId: "r1" });
  await tick();

  assert.ok(sentFor(h.sent, "Fetch.failRequest", "r2"), "the off-origin hop is failed, not followed");
  assert.ok(!sentFor(h.sent, "Fetch.continueRequest", "r2"), "the off-origin hop is never continued");
  assert.equal(closed, true, "a popup that tried to leave is closed");
});

test("inline: a top-level data:/blob: document is refused even when the decide hook drops isNavigation", async () => {
  for (const url of ["data:text/html,<script>alert(1)</script>", `blob:${O}/abc`]) {
    const h = harness();
    const policy = await h.ready;
    await policy.attachPage(fakePage());

    pause(h.handlers, { id: "d1", url, resourceType: "Document" });
    await tick();

    assert.ok(sentFor(h.sent, "Fetch.failRequest", "d1"), `${url} must be failed as a top-level document`);
    assert.ok(!sentFor(h.sent, "Fetch.continueRequest", "d1"), `${url} must not be continued`);
  }
});

test("inline: a data: image subresource is still allowed (only top-level documents are refused)", async () => {
  const h = harness();
  const policy = await h.ready;
  await policy.attachPage(fakePage());

  pause(h.handlers, { id: "i1", url: "data:image/png;base64,AA", resourceType: "Image" });
  await tick();

  assert.ok(sentFor(h.sent, "Fetch.continueRequest", "i1"), "an inline image is not a document and still loads");
});
