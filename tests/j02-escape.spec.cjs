// J02: Gate 0. Every way a page in a journey might reach off the fixture, tried for real against a decoy server.
// A hit on the decoy is an escape. These run the same guards uat_journey.cjs installs, with no model in the loop.
"use strict";

const http = require("http");
const { test, expect } = require("@playwright/test");
const { installJourneyGuard } = require("../lib/netpolicy.cjs");
const { decideFixtureRequest } = require("../lib/policy.cjs");

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function decoyServer() {
  const hits = [];
  const d = await listen((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    res.writeHead(200, { "Content-Type": "text/html", "Access-Control-Allow-Origin": "*" });
    res.end("<title>decoy</title>decoy");
  });
  d.server.on("upgrade", (req, socket) => { hits.push(`UPGRADE ${req.url}`); socket.destroy(); });
  return { ...d, hits };
}

async function appServer(decoy, script) {
  const writes = [];
  const page = `<!doctype html><title>app</title><a id="link" href="${decoy}/link" target="_blank">out</a>
<form id="form" action="${decoy}/form" method="get"><input name="q" value="1"></form>
<script>const DECOY=${JSON.stringify(decoy)};</script>`;
  return listen((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") writes.push(`${req.method} ${req.url}`);
    if (req.url === "/hop") { res.writeHead(302, { Location: `${decoy}/hop` }); return res.end(); }
    if (req.url === "/refresh") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(`<meta http-equiv="refresh" content="0;url=${decoy}/refresh">`);
    }
    if (req.url === "/w.js" || req.url === "/s.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      const body = `fetch(${JSON.stringify(`${decoy}/worker`)}).catch(()=>{}); fetch("/worker-write",{method:"POST",body:"{}"}).catch(()=>{});`;
      return res.end(req.url === "/s.js" ? `onconnect=()=>{}; ${body}` : body);
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(page);
  }).then((a) => ({ ...a, writes, script }));
}

// name -> what the page does. Each is ordinary behaviour a test app, or a malicious one, could show a player.
const VECTORS = {
  "fetch": () => fetch(`${DECOY}/fetch`).catch(() => {}),
  "image": () => { new Image().src = `${DECOY}/img`; },
  "script tag": () => { const s = document.createElement("script"); s.src = `${DECOY}/s`; document.body.append(s); },
  "iframe": () => { const f = document.createElement("iframe"); f.src = `${DECOY}/iframe`; document.body.append(f); },
  "sendBeacon": () => navigator.sendBeacon(`${DECOY}/beacon`, "x"),
  "EventSource": () => { new EventSource(`${DECOY}/es`); },
  "WebSocket": () => { new WebSocket(`${DECOY.replace("http", "ws")}/ws`); },
  "main-frame navigation": () => { location.href = `${DECOY}/nav`; },
  "redirect hop": () => { location.href = "/hop"; },
  "meta refresh": () => { location.href = "/refresh"; },
  "form submit": () => document.getElementById("form").submit(),
  "window.open": () => { window.open(`${DECOY}/open`); },
  "window.open of a redirect": () => { window.open("/hop"); },
  "window.open then navigate": () => { const w = window.open("about:blank"); w.location = `${DECOY}/later`; },
  "link with target=_blank": () => document.getElementById("link").click(),
  "dedicated worker": () => { new Worker("/w.js"); },
  "shared worker": () => { new SharedWorker("/s.js"); },
  "shared worker from a srcdoc iframe": () => { const f = document.createElement("iframe"); f.srcdoc = `<script>new SharedWorker("/s.js")<\/script>`; document.body.append(f); },
  "blob: worker": () => { new Worker(URL.createObjectURL(new Blob([`fetch(${JSON.stringify(`${DECOY}/blobworker`)}).catch(()=>{})`], { type: "text/javascript" }))); },
  "data: navigation": () => { location.href = `data:text/html,<script>fetch("${DECOY}/datanav").catch(()=>{})<\/script>`; },
  "data: iframe": () => { const f = document.createElement("iframe"); f.src = `data:text/html,<script>fetch("${DECOY}/dataframe").catch(()=>{})<\/script>`; document.body.append(f); },
  "blob: popup": () => { window.open(URL.createObjectURL(new Blob([`<script>fetch("${DECOY}/blobpopup").catch(()=>{})<\/script>`], { type: "text/html" }))); },
  "srcdoc iframe": () => { const f = document.createElement("iframe"); f.srcdoc = `<script>fetch("${DECOY}/srcdoc").catch(()=>{})<\/script>`; document.body.append(f); },
};

// An inline document carries its own script, so "no decoy hit" alone does not prove the document was refused:
// its fetch can be blocked while the data:/blob: document itself still becomes the page. These checks run after
// the wait for the two inline-scheme vectors and assert the document never stayed as a page.
function expectNoLiveInlinePage(ctx) {
  for (const p of ctx.pages()) {
    expect(p.url(), "a live page left on an inline document").not.toMatch(/^(blob|data):/i);
  }
}

const AFTER_WAIT = {
  "data: navigation": ({ page, ctx, app }) => {
    // Chrome refuses a top-frame data: navigation started by page script, so the tab must still be on the fixture.
    expect(page.url().startsWith(app.origin), `top-level page after a data: navigation: ${page.url()}`).toBe(true);
    expectNoLiveInlinePage(ctx);
  },
  "blob: popup": ({ ctx, blocked }) => {
    // A popup that committed a blob document must be gone, not sitting there with a blocked fetch.
    expectNoLiveInlinePage(ctx);
    // The guard reports either the inline refusal (CDP sees the document request) or the page-close backstop
    // (the blob document commits before CDP attaches). One of them must be present.
    expect(
      blocked.some((b) => /inline scheme/i.test(b.reason) || b.kind === "page"),
      "the guard reported the blob document"
    ).toBe(true);
  },
};

for (const [name, vector] of Object.entries(VECTORS)) {
  test(`J02: ${name} does not reach off the fixture`, async ({ browser }) => {
    const decoy = await decoyServer();
    const app = await appServer(decoy.origin);
    const blocked = [];
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    try {
      const policy = await installJourneyGuard(ctx, {
        fixtureOrigin: app.origin,
        onBlock: (b) => blocked.push(b),
        decide: ({ url, method }) => decideFixtureRequest({ url, method, fixtureOrigin: app.origin, allowWrites: false }),
      });
      const page = await ctx.newPage();
      await policy.attachPage(page);
      await page.goto(`${app.origin}/`, { waitUntil: "domcontentloaded" });
      await page.evaluate(`(${vector.toString()})()`).catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));
      expect(decoy.hits, "requests that reached the decoy").toEqual([]);
      expect(app.writes, "writes that reached the fixture").toEqual([]);
      const afterWait = AFTER_WAIT[name];
      if (afterWait) afterWait({ page, ctx, blocked, app });
    } finally {
      await ctx.close();
      app.server.close();
      decoy.server.close();
    }
  });
}

// The guard must not break the app it guards: ordinary same-origin behaviour still works.
test("J02: a same-origin popup and a same-origin redirect still work, and a page sent away is closed", async ({ browser }) => {
  const decoy = await decoyServer();
  const app = await listen((req, res) => {
    if (req.url === "/local-hop") { res.writeHead(302, { Location: "/landed" }); return res.end(); }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<!doctype html><title>${req.url}</title>page`);
  });
  const blocked = [];
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  try {
    const policy = await installJourneyGuard(ctx, {
      fixtureOrigin: app.origin, onBlock: (b) => blocked.push(b),
      decide: ({ url, method }) => decideFixtureRequest({ url, method, fixtureOrigin: app.origin, allowWrites: false }),
    });
    const page = await ctx.newPage();
    await policy.attachPage(page);
    await page.goto(`${app.origin}/local-hop`);
    expect(page.url()).toBe(`${app.origin}/landed`);
    const [popup] = await Promise.all([ctx.waitForEvent("page"), page.evaluate(() => { window.open("/inner"); })]);
    await popup.waitForLoadState();
    expect(popup.url()).toBe(`${app.origin}/inner`);
    expect(popup.isClosed()).toBe(false);
    // A blocked popup may never finish opening, so this looks at what is left rather than waiting for it.
    await page.evaluate((d) => { window.open(`${d}/away`); }, decoy.origin);
    await new Promise((r) => setTimeout(r, 1500));
    expect(decoy.hits).toEqual([]);
    expect(blocked.some((b) => /off-origin/.test(b.reason) && /\/away$/.test(b.path))).toBe(true);
    const others = ctx.pages().filter((p) => p !== page && p !== popup).map((p) => p.url());
    expect(others.filter((u) => u !== "about:blank")).toEqual([]);
  } finally {
    await ctx.close();
    app.server.close();
    decoy.server.close();
  }
});
