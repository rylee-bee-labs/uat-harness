#!/usr/bin/env node
// Journey mode, Phase 1: one repeatable, LOOK-ONLY journey against a LOCAL copy of a built web app with
// fictional seed data, walked by a scripted newcomer (no model). Writes a plain-language report.
//
//   node uat_journey.cjs <journey.json> --dist <built-app-dir> [--src <product web/src>] [--out DIR]
//                        [--build-label TEXT]
//
// Safety, in order of importance (docs/superpowers/specs/2026-10-28-human-shaped-uat-design.md section 10):
//   * The harness starts the fixture itself on 127.0.0.1 (a port the OS picks) and proves it is that fixture
//     with a one-time nonce. There is no way to point a journey at any other origin.
//   * The browser may reach ONLY that origin and may send only reads (CDP Fetch, every hop). Every refusal is
//     recorded. A write that still reached the server is recorded too (it should always be zero).
//   * The newcomer cannot press anything that answers, approves, clears or sends; it types nothing.
//   * No credentials, no live data. Findings never set the exit code. Exit 0 = the run completed.
//     Exit 2 = the run could not start (NOT RUN, with the reason). Exit 1 = the harness itself failed.
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const { decideFixtureRequest } = require("./lib/policy.cjs");
const { installCdpRequestPolicy, installWebSocketPolicy } = require("./lib/netpolicy.cjs");
const { finalizeArtifacts, stageDirFor } = require("./lib/artifacts.cjs");
const { startFixtureServer, verifyIdentity } = require("./lib/journey/fixture-server.cjs");
const probes = require("./lib/journey/probes.cjs");
const { runStep } = require("./lib/journey/newcomer.cjs");
const { buildFindings, findWords } = require("./lib/journey/findings.cjs");
const { renderReport, findUnsafe, verdictOf } = require("./lib/journey/report.cjs");
const { locateInSource } = require("./lib/journey/source-refs.cjs");

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--dist" || k === "--src" || k === "--out" || k === "--build-label") a[k.slice(2)] = argv[++i];
    else a._.push(k);
  }
  return a;
}

class NotRun extends Error {}

function loadPlaywright() {
  for (const id of ["@playwright/test", path.join(__dirname, "node_modules/@playwright/test")]) {
    try { return require(id); } catch (_) { /* next */ }
  }
  throw new NotRun("Playwright is not installed. Run `npm install` in this repo. -> next: npm install");
}

function expand(s, planted) {
  return String(s).replace(/\{planted\.(\w+)\}/g, (_, k) => planted[k]);
}

// Names like "moss-agent" are on screen as "Moss": accept the person-like first part too.
function nameForms(name) {
  const forms = [name];
  const head = name.split(/[-_ ]/)[0];
  if (head && head.length >= 3 && head !== name) forms.push(head);
  return forms;
}

async function settle(page, cues, { timeout = 8000, afterMs = 700 } = {}) {
  const lower = cues.map((c) => c.toLowerCase());
  await page.waitForFunction((needles) => {
    const t = document.body.innerText.toLowerCase();
    return needles.some((n) => t.includes(n));
  }, lower, { timeout }).catch(() => {});
  await page.waitForTimeout(afterMs);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const journeyPath = args._[0];
  const dist = args.dist || process.env.UAT_JOURNEY_DIST;
  const srcDir = args.src || process.env.UAT_JOURNEY_SRC || null;
  if (!journeyPath) throw new NotRun("usage: node uat_journey.cjs <journey.json> --dist <built-app-dir> [--src <web/src>] [--out DIR]");
  if (!dist) throw new NotRun("NOT RUN (no built app): pass --dist <built-app-dir>. -> next: build the product's web app, then re-run");
  if (!fs.existsSync(path.join(dist, "index.html"))) throw new NotRun("NOT RUN (no built app): index.html not found in --dist. -> next: build the product's web app");

  const journey = JSON.parse(fs.readFileSync(journeyPath, "utf8"));
  const jdir = path.dirname(path.resolve(journeyPath));
  const fixtureData = require(path.join(jdir, "fixture-data.cjs"));
  const jargon = JSON.parse(fs.readFileSync(path.join(jdir, journey.jargon_file), "utf8")).terms;
  const outDir = path.resolve(args.out || path.join("runs", `${journey.id}-${new Date().toISOString().replace(/[:.]/g, "-")}`));
  const stage = stageDirFor(outDir);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(path.join(stage, "private", "screens"), { recursive: true });

  const { chromium } = loadPlaywright();
  const fx = fixtureData.buildFixture();
  const planted = fx.planted;
  const t0 = Date.now();
  const startedAt = new Date().toISOString();
  const timeline = [];
  const tl = (step, text) => timeline.push({ ms: Date.now() - t0, step, text });
  const shots = [];
  const blocked = [];
  const refusedPresses = [];
  const consoleErrors = [];
  const pageErrors = [];

  // 1. Start the fixture ourselves and make it prove who it is.
  const server = await startFixtureServer({ distDir: dist, routes: fx.routes, fixtureId: fixtureData.FIXTURE_ID });
  let browser;
  const cleanup = async () => { try { if (browser) await browser.close(); } catch (_) { /* closing */ } await server.stop(); };
  process.on("SIGINT", async () => { await cleanup(); fs.rmSync(stage, { recursive: true, force: true }); process.exit(130); });
  process.on("SIGTERM", async () => { await cleanup(); fs.rmSync(stage, { recursive: true, force: true }); process.exit(130); });

  try {
    const idBody = await (await fetch(`${server.origin}/.well-known/uat-fixture`)).text();
    const id = verifyIdentity(idBody, { fixtureId: journey.fixture_id, nonce: server.nonce });
    if (!id.ok) throw new NotRun(`NOT RUN (unauthorized target): ${id.reason}`);
    tl("start", "Started a local copy of the app with made-up data. It proved who it is with a one-time code.");

    browser = await chromium.launch();
    const engineVersion = browser.version();

    async function newContext(viewport, touch) {
      const ctx = await browser.newContext({
        viewport, deviceScaleFactor: 1, serviceWorkers: "block", reducedMotion: journey.persona.reduced_motion === "reduce" ? "reduce" : "no-preference",
        isMobile: !!touch, hasTouch: !!touch,
      });
      const policy = await installCdpRequestPolicy(ctx, {
        onBlock: (b) => blocked.push(b),
        decide: ({ url, method }) => decideFixtureRequest({ url, method, fixtureOrigin: server.origin, allowWrites: false }),
      });
      await installWebSocketPolicy(ctx, { readOnly: true, onBlock: (b) => blocked.push(b) });
      const page = await ctx.newPage();
      await policy.attachPage(page);
      page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });
      page.on("pageerror", (e) => pageErrors.push(String(e.message || e).slice(0, 160)));
      return { ctx, page };
    }
    // Prove the look-only guard is armed in THIS run before anything else happens: a test write and a test
    // request to another address must both be stopped in the browser. Fail closed if either gets out.
    async function guardSelfTest(page) {
      const before = blocked.length;
      const r = await page.evaluate(async () => {
        const out = {};
        try { await fetch("/api/uat-guard-canary", { method: "POST", body: "{}" }); out.post = "sent"; } catch (_) { out.post = "blocked"; }
        try { await fetch("http://127.0.0.1:9/uat-guard-canary"); out.off = "sent"; } catch (_) { out.off = "blocked"; }
        return out;
      });
      const canary = blocked.splice(before); // the test's own blocks are not the walk's
      if (r.post !== "blocked" || r.off !== "blocked" || canary.length < 2) {
        throw new NotRun("NOT RUN (look-only guard not armed): the browser did not stop a test write. -> next: report this as a harness bug");
      }
      ev.guard = { armed: true };
    }
    async function shot(page, name, what) {
      const file = `private/screens/${name}.png`;
      await page.screenshot({ path: path.join(stage, file) });
      shots.push({ file, what });
    }

    const stepCues = journey.steps[0].cues;
    const D = journey.persona.desktop;
    const ev = { journey: journey.id, started_at: startedAt, planted, desktop: { keys: { tabs: 0, enters: 0 }, axe: {} }, phone: {}, lookOnly: {}, console: {}, engine: {} };

    // 2. Desktop, keyboard only.
    {
      const { ctx, page } = await newContext(D, false);
      await page.goto(`${server.origin}/`, { waitUntil: "domcontentloaded" });
      await guardSelfTest(page);
      await settle(page, stepCues);
      const home = await probes.measure(page);
      await shot(page, "01-home-desktop", "Home (the Hall) on a 1280 by 800 desktop, as first seen");
      const seenCue = stepCues.find((c) => home.firstScreenText.toLowerCase().includes(c));
      tl("look", seenCue ? `Home is open. On the first screen I can read "${seenCue}" (${home.firstScreenWordCount} words on screen).` : `Home is open. No sign of "${stepCues[0]}" on the first screen (${home.firstScreenWordCount} words on screen).`);
      const contractMap = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, "contract-map.json"), "utf8")).rules || {}; } catch (_) { return {}; } })();
      ev.desktop.axe.Home = await probes.runAxe(page, { contractMap });
      ev.desktop.home = { measure: home };

      // Step 1: Tab to something that sounds like "waiting for me", then Enter on a link.
      await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
      const s1 = await runStep(page, journey.steps[0], { maxTabs: journey.budget.max_tabs_per_step, log: (t) => tl(journey.steps[0].id, t) });
      ev.desktop.keys.tabs += s1.tabs;
      refusedPresses.push(...s1.refused.map((r) => ({ name: r.name, why: r.why })));
      await shot(page, "02-home-focus", "Home with keyboard focus on the control the newcomer picked");
      if (s1.found) {
        await page.keyboard.press("Enter"); ev.desktop.keys.enters += 1;
        await settle(page, journey.steps[1].region_cues);
        tl(journey.steps[0].id, `Enter. Now on ${new URL(page.url()).pathname}.`);
      }

      // Step 2: Tab to the first thing in "Waiting on you"; open it (a disclosure, read-only).
      let s2 = { found: false, tabs: 0, stops: [], refused: [] };
      const inboxPre = await probes.measure(page);
      await shot(page, "03-inbox-desktop", "The page the newcomer reached, before opening anything");
      if (s1.found) {
        s2 = await runStep(page, journey.steps[1], { maxTabs: journey.budget.max_tabs_per_step, log: (t) => tl(journey.steps[1].id, t) });
        ev.desktop.keys.tabs += s2.tabs;
        refusedPresses.push(...s2.refused.map((r) => ({ name: r.name, why: r.why })));
        if (s2.found) {
          await page.keyboard.press("Enter"); ev.desktop.keys.enters += 1;
          await page.waitForTimeout(500);
        }
      }
      const inbox = await probes.measure(page);
      await shot(page, "04-inbox-opened", "The first waiting card, opened (still nothing answered)");
      ev.desktop.axe.Inbox = await probes.runAxe(page, { contractMap });
      ev.desktop.steps = [s1, s2];
      ev.desktop.inbox = { measure: inbox, pre: inboxPre };
      tl("read", `Read the page. ${inbox.bodyText.includes(planted.question) ? `Found the thing waiting: "${planted.question}"` : "Did not find the thing waiting."}`);

      // The harness (not the newcomer) checks the answer against the planted seed data.
      const textNow = inbox.bodyText.toLowerCase();
      const whoExpected = journey.oracle.who_is_waiting.map((x) => expand(x, planted));
      const whoFound = whoExpected.filter((w) => nameForms(w).some((f) => textNow.includes(f.toLowerCase())));
      ev.oracle = {
        what_needs_me: { expected: expand(journey.oracle.what_needs_me, planted), ok: inbox.bodyText.includes(expand(journey.oracle.what_needs_me, planted)) },
        who_is_waiting: { expected: whoExpected, found: whoFound, missing: whoExpected.filter((w) => !whoFound.includes(w)), ok: whoFound.length === whoExpected.length },
      };
      tl("read", ev.oracle.who_is_waiting.ok ? `Found who is waiting (${whoFound.join(", ")}).` : `Could not find who is waiting (${ev.oracle.who_is_waiting.missing.join(", ")}) anywhere on the page.`);
      await ctx.close();
    }

    // 3. Phone glance, touch emulation. Looks, then taps one link (a read).
    {
      const { ctx, page } = await newContext(journey.persona.phone, true);
      await page.goto(`${server.origin}/`, { waitUntil: "domcontentloaded" });
      await guardSelfTest(page);
      await settle(page, stepCues);
      const home = await probes.measure(page);
      const link = page.getByRole("link", { name: /waiting for you/i }).first();
      const box = await link.boundingBox().catch(() => null);
      await shot(page, "05-home-phone", "Home on a 390 by 844 phone, first screen only");
      ev.phone.home = { measure: home, cue: box ? { y: Math.round(box.y), h: Math.round(box.height), w: Math.round(box.width) } : null };
      tl("phone", box ? `Phone Home: "waiting for you" starts ${Math.round(box.y)} px down a ${home.viewport.h} px screen.` : "Phone Home: no \"waiting for you\" link found.");
      if (box) {
        if (box.y + box.height > home.viewport.h) await link.scrollIntoViewIfNeeded();
        const b2 = await link.boundingBox();
        await page.touchscreen.tap(b2.x + b2.width / 2, b2.y + b2.height / 2);
        await settle(page, journey.steps[1].region_cues);
      }
      const inbox = await probes.measure(page);
      await shot(page, "06-inbox-phone", "Inbox on the phone after one tap, first screen only");
      const visible = inbox.firstScreenText.includes(planted.question);
      ev.phone.inbox = { measure: inbox, questionVisible: visible };
      tl("phone", visible ? "Phone Inbox: the thing waiting is on the first screen." : "Phone Inbox: the thing waiting is NOT on the first screen.");
      await ctx.close();
    }

    // 4. Gather and write.
    const consolesFiltered = consoleErrors.filter((m) => !/404 \(Not Found\)/.test(m));
    ev.console = { errors: consolesFiltered, pageErrors };
    ev.lookOnly = { blocked, reachedServer: server.mutations(), refusedPresses };
    ev.unmocked = server.unmocked();
    ev.wall_ms = Date.now() - t0;
    ev.timeline = timeline;
    ev.fixture = { id: journey.fixture_id, identity_ok: true };
    ev.engine = { version: engineVersion, desktop: `${D.width} by ${D.height}`, phone: `${journey.persona.phone.width} by ${journey.persona.phone.height}` };
    let sha = null;
    if (srcDir) { try { sha = execFileSync("git", ["-C", srcDir, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(); } catch (_) { /* not a repo */ } }
    ev.build = { label: args["build-label"] || (sha ? `the product's source at revision ${sha}` : "revision not recorded") };

    const screens = { "Home (first screen)": ev.desktop.home.measure.firstScreenText, Inbox: ev.desktop.inbox.measure.bodyText };
    const words = findWords(screens, jargon);
    const findings = buildFindings({ ...ev, words }, { jargon, hints: journey.source_hints });
    // phone inbox: is the answer on the first screen?
    if (ev.phone.inbox && !ev.phone.inbox.questionVisible) {
      findings.cold.push({
        id: "phone-inbox-first-screen", severity: 2, screen: "Inbox on a 390 px phone",
        title: "On a phone, the waiting question is not on the first screen of the Inbox",
        what: "After one tap from Home, the first screen did not show the question.", why: "One glance should show the top thing.",
        suggestion: "Put the first waiting card at the top, above notices and the Clear button.", next: "A Project Home agent can make the change; the owner approves it (a product change).", ref: { file: journey.source_hints.Inbox, needle: "Waiting on you" },
      });
      findings.cold.sort((a, b) => b.severity - a.severity);
    }
    const refs = {};
    const attach = (id, r) => { if (!r) return; const resolved = locateInSource(srcDir, r.needle, { prefer: r.file }); refs[id] = { file: r.file, resolved: resolved || null }; };
    findings.cold.forEach((c) => attach(c.id, c.ref));
    findings.warm.forEach((w) => attach(w.id, w.ref));
    for (const w of words) {
      w.ref = [`>${w.term}`, `"${w.term}"`, `"${w.term}`, w.term].map((n) => locateInSource(srcDir, n)).find(Boolean) || null;
    }

    const run = { journey, evidence: ev, findings, words, refs, shots };
    const report = renderReport(run);
    const unsafe = findUnsafe(report);
    if (unsafe.length) throw new Error(`the report would publish ${unsafe.join(" and ")}; withheld (fail closed)`);
    fs.writeFileSync(path.join(stage, "report.md"), report);
    const summary = {
      run_id: `${journey.id}-${startedAt}`, journey: journey.id, fixture_id: journey.fixture_id, started_at: startedAt,
      verdict: verdictOf(ev.oracle), verified_by: "oracle", newcomer: "scripted", wall_ms: ev.wall_ms,
      keys: ev.desktop.keys, cold: findings.cold.map((c) => ({ id: c.id, severity: c.severity, title: c.title })),
      warm: findings.warm.map((w) => ({ id: w.id, title: w.title })),
      look_only: { blocked: blocked.length, reached_server: ev.lookOnly.reachedServer.length },
    };
    fs.writeFileSync(path.join(stage, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
    fs.writeFileSync(path.join(stage, "private", "evidence.json"), JSON.stringify(ev, null, 2) + "\n");
    finalizeArtifacts(outDir, "", { stageDir: stage });
    console.log(`Journey "${journey.id}": ${summary.verdict} in ${(ev.wall_ms / 1000).toFixed(1)} s. ${findings.cold.length} cold spots, ${findings.warm.length} warm moments.`);
    console.log(`Report: ${path.relative(process.cwd(), path.join(outDir, "report.md"))}`);
    console.log(`Look-only: ${blocked.length} blocked in the browser, ${ev.lookOnly.reachedServer.length} writes reached the server.`);
  } finally {
    await cleanup();
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

main().then(() => process.exit(0)).catch((e) => {
  if (e instanceof NotRun) { console.error(e.message); process.exit(2); }
  console.error(`journey failed: ${e && e.stack ? e.stack.split("\n").slice(0, 4).join("\n") : e}`);
  process.exit(1);
});
