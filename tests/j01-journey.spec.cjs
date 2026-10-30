// J01: journey mode, Phase 1. A scripted newcomer walks a demo product; the harness checks, against the seed data,
// whether it got there, and proves the look-only guarantee: nothing but reads leaves the browser, the newcomer
// refuses to press a control that writes, and a run with no built app is NOT RUN, never a pass.
"use strict";

const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { installCdpRequestPolicy } = require("../lib/netpolicy.cjs");
const { decideFixtureRequest } = require("../lib/policy.cjs");
const { startFixtureServer } = require("../lib/journey/fixture-server.cjs");
const { makeDemo } = require("./helpers/demo-journey.cjs");
const { run } = require("./helpers/run.cjs");

const CLI = path.resolve(__dirname, "..", "uat_journey.cjs");

function walkFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkFiles(p)); else out.push(p);
  }
  return out;
}

async function journey(opts) {
  const demo = makeDemo(opts);
  const out = path.join(demo.root, "out");
  const res = await run(process.execPath, [CLI, demo.journey, "--dist", demo.dist, "--out", out], { timeout: 120000 });
  return { demo, out, res };
}

test("J01: the newcomer gets there, the harness verifies by oracle, nothing is written", async () => {
  const { demo, out, res } = await journey({ asker: true });
  try {
    expect(res.status, res.stderr).toBe(0);
    const summary = JSON.parse(fs.readFileSync(path.join(out, "summary.json"), "utf8"));
    expect(summary.verdict).toBe("YES");
    expect(summary.verified_by).toBe("oracle");
    expect(summary.look_only.reached_server).toBe(0);
    expect(summary.look_only.blocked).toBeGreaterThan(0);          // the page's own POST on load was stopped in the browser
    const report = fs.readFileSync(path.join(out, "report.md"), "utf8");
    expect(report).toMatch(/Got there\? YES/);
    expect(report).toMatch(/chose not to press: "Approve now"/);   // the writing button was seen and refused
    expect(report).toMatch(/Guard self-test, before the walk: a test write/);
  } finally { demo.cleanup(); }
});

test("J01: found the thing but not who is waiting is PARTLY, and the cold spot says so", async () => {
  const { demo, out, res } = await journey({ asker: false });
  try {
    expect(res.status, res.stderr).toBe(0);
    const summary = JSON.parse(fs.readFileSync(path.join(out, "summary.json"), "utf8"));
    expect(summary.verdict).toBe("PARTLY");
    expect(summary.cold.map((c) => c.id)).toContain("who-not-shown");
  } finally { demo.cleanup(); }
});

test("J01: a newcomer who reached the wrong screen is NO (the oracle, not the newcomer, decides)", async () => {
  const { demo, out, res } = await journey({ question: "Something else entirely?" });
  try {
    expect(res.status, res.stderr).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(out, "summary.json"), "utf8")).verdict).toBe("NO");
  } finally { demo.cleanup(); }
});

test("J01: no built app is NOT RUN (exit 2), with the way forward, and nothing is written", async () => {
  const { demo, out, res } = await journey({ build: false });
  try {
    expect(res.status).toBe(2);
    expect(res.stderr).toMatch(/NOT RUN \(no built app\)/);
    expect(res.stderr).toMatch(/-> next:/);
    expect(fs.existsSync(path.join(out, "report.md"))).toBe(false);
  } finally { demo.cleanup(); }
});

test("J01: output has no image outside private/, no staging left behind, and no real port or machine path", async () => {
  const { demo, out, res } = await journey({ asker: true });
  try {
    expect(res.status, res.stderr).toBe(0);
    const files = walkFiles(out).map((f) => path.relative(out, f));
    expect(files.filter((f) => f.endsWith(".png") && !f.startsWith("private" + path.sep))).toEqual([]);
    expect(files.some((f) => f.split(path.sep).includes(".staging"))).toBe(false);
    expect(files).toEqual(expect.arrayContaining(["report.md", "summary.json", path.join("private", "evidence.json")]));
    const shareable = fs.readFileSync(path.join(out, "report.md"), "utf8") + fs.readFileSync(path.join(out, "summary.json"), "utf8");
    expect(shareable).not.toMatch(/127\.0\.0\.1:\d{2,5}/);
    expect(shareable).not.toContain(demo.root);
  } finally { demo.cleanup(); }
});

test("J01: the fixture guard stops a write, an off-origin read and an off-origin popup; nothing reaches the server", async ({ browser }) => {
  const demo = makeDemo();
  const server = await startFixtureServer({ distDir: demo.dist, routes: {}, fixtureId: "demo-home" });
  const blocked = [];
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const policy = await installCdpRequestPolicy(ctx, {
    onBlock: (b) => blocked.push(b),
    decide: ({ url, method }) => decideFixtureRequest({ url, method, fixtureOrigin: server.origin }),
  });
  try {
    const page = await ctx.newPage();
    await policy.attachPage(page);
    await page.goto(`${server.origin}/`, { waitUntil: "domcontentloaded" });
    const out = await page.evaluate(async () => {
      const r = {};
      try { await fetch("/api/anything", { method: "DELETE" }); r.del = "sent"; } catch (_) { r.del = "blocked"; }
      try { await fetch("http://127.0.0.1:9/x"); r.off = "sent"; } catch (_) { r.off = "blocked"; }
      return r;
    });
    expect(out).toEqual({ del: "blocked", off: "blocked" });
    expect(blocked.map((b) => b.reason)).toEqual(expect.arrayContaining([expect.stringMatching(/look-only: DELETE/), expect.stringMatching(/off-origin/)]));
    expect(server.mutations()).toEqual([]);
    // an off-origin navigation is refused too (a link or popup can never leave the fixture)
    const popup = await ctx.newPage();
    await policy.attachPage(popup);
    await popup.goto("http://127.0.0.1:9/away").catch(() => {});
    expect(blocked.some((b) => b.kind === "http" && /off-origin/.test(b.reason) && /\/away$/.test(b.path))).toBe(true);
  } finally {
    await ctx.close();
    await server.stop();
    demo.cleanup();
  }
});
