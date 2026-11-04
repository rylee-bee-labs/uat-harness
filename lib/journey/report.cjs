// Render a journey run as a short, plain-language report (the shape of the VEFR newcomer report:
// did I get there, timed log, warm moments, cold spots, words, screenshots). Pure: no browser, no disk.
// Public-safe by construction: no host names, ports, machine paths or credentials are ever written.
"use strict";

const secs = (ms) => `+${(ms / 1000).toFixed(1)} s`;

// A verdict is one of three statuses (spec §4), never a boolean. UNKNOWN when the newcomer never
// reached the check, so there is no evidence to pass or fail it on.
function verdictOf(oracle) {
  if (!oracle || oracle.exercised === false) return "UNKNOWN";
  const a = oracle.what_needs_me && oracle.what_needs_me.ok;
  const b = oracle.who_is_waiting && oracle.who_is_waiting.ok;
  return a && b ? "PASS" : "FAIL";
}

function refText(r) {
  if (!r) return null;
  if (r.resolved) return `\`${r.resolved}\``;
  if (r.file) return `\`${r.file}\``;
  return null;
}

function renderReport(run) {
  const { journey, evidence: ev, findings: f, words = [], refs = {}, shots = [] } = run;
  const verdict = verdictOf(ev.oracle);
  const keys = ev.desktop.keys || { tabs: 0, enters: 0 };
  const L = [];
  L.push(`# ${journey.product} through a newcomer's eyes: a quick glance`);
  L.push("");
  L.push(`Run ${ev.started_at.slice(0, 10)}. Short lines on purpose.`);
  L.push("**Look-only.** A local copy of the built app with made-up data. Nothing live was touched.");
  L.push("Nothing was answered, approved, sent or cleared.");
  L.push("");
  L.push(`Goal: "${journey.goal}"`);
  L.push("");
  L.push("## At a glance");
  L.push("");
  const wallS = (ev.wall_ms / 1000).toFixed(1);
  const gotThere = verdict === "PASS" ? "I found the one thing and who is waiting."
    : verdict === "FAIL" ? "I did not find what the goal asked for."
      : "I could not reach the check, so this is UNKNOWN.";
  L.push(`- **Got there? ${verdict}.** ${gotThere}`);
  const under = ev.wall_ms <= (journey.budget.seconds * 1000);
  L.push(`- **Under a minute?** ${under ? "Yes" : "No"} on the scripted newcomer's clock (${wallS} s). For a person: UNKNOWN.`);
  L.push(`- **Time:** ${wallS} s on the scripted newcomer's clock; ${keys.tabs} Tab presses and ${keys.enters} Enter presses. A person was not timed (UNKNOWN).`);
  const top = f.cold.slice(0, 3);
  L.push("- **Top 3 cold spots:**");
  top.forEach((c, i) => L.push(`  ${i + 1}. ${c.title}.`));
  if (!top.length) L.push("  (none found)");
  L.push(`- **Who acts next:** ${top.length ? [...new Set(top.map((c) => c.next))].join(" ") : "Nobody; nothing was found."}`);
  L.push("");
  L.push("## Did I get there?");
  L.push("");
  if (verdict === "UNKNOWN") {
    L.push("**UNKNOWN.** The newcomer never reached the check, so there is no evidence to pass or fail it on.");
  } else {
    L.push(`**${verdict}.** The check was made by the harness, outside the newcomer, against the planted seed data (verified by: oracle).`);
  }
  L.push("");
  const o = ev.oracle;
  L.push(`- What needs me: ${o.what_needs_me.ok ? "found" : "NOT found"} (\`${o.what_needs_me.expected}\`).`);
  L.push(`- Who is waiting on whom: ${o.who_is_waiting.ok ? "found" : "NOT found on screen"}. Looked for: ${o.who_is_waiting.expected.map((x) => `\`${x}\``).join(", ")}. ${o.who_is_waiting.found.length ? `Seen: ${o.who_is_waiting.found.join(", ")}.` : "Seen: none."}`);
  L.push("");
  L.push("Please read the minutes kindly:");
  L.push("");
  L.push("- This was a scripted newcomer, not a model and not a person. It follows the goal's words and uses only the keyboard.");
  L.push("- It reads the screen as text and accessible names. It does not look at pictures.");
  L.push("- A real person would be slower and would also scan by eye. By how much: UNKNOWN.");
  L.push("");
  L.push("## The timed log");
  L.push("");
  L.push("| When | Step | What happened |");
  L.push("|---|---|---|");
  for (const t of ev.timeline) L.push(`| ${secs(t.ms)} | ${t.step} | ${String(t.text).replace(/\|/g, "\\|")} |`);
  L.push("");
  L.push("## Warm moments");
  L.push("");
  const warm = f.warm.filter((w) => !w.harness);
  if (!warm.length) L.push("None found by measurement.");
  warm.forEach((w, i) => {
    L.push(`${i + 1}. **${w.title}.**`);
    L.push(`   ${w.text}${refs[w.id] ? ` (${refText(refs[w.id])})` : ""}`);
  });
  L.push("");
  L.push("## Cold spots (ranked)");
  L.push("");
  L.push("Most felt first. A finding is evidence for a person to weigh, not a pass or fail.");
  L.push("");
  if (!f.cold.length) L.push("None found.");
  f.cold.forEach((c, i) => {
    L.push(`### ${i + 1}. ${c.title}`);
    L.push("");
    L.push(`- **Where:** ${c.screen}${refs[c.id] ? `. Look in ${refText(refs[c.id])}` : ""}.`);
    L.push(`- **What happened:** ${c.what}`);
    L.push(`- **Why it matters:** ${c.why}`);
    L.push(`- **Suggestion:** ${c.suggestion}`);
    L.push(`- **Who acts next:** ${c.next}`);
    L.push("");
  });
  L.push("## Words a newcomer wouldn't know");
  L.push("");
  if (!words.length) L.push("None from the curated list were on screen.");
  for (const w of words) {
    L.push(`- **${w.term}** (${w.screens.join(", ")}): maybe "${w.gloss}".${w.ref ? ` First match in the source: \`${w.ref}\`.` : ""}`);
  }
  L.push("");
  L.push("The list was made by reading the screens. It is not exhaustive.");
  L.push("");
  L.push("## Look-only check");
  L.push("");
  const lo = ev.lookOnly;
  L.push(`- Guard self-test, before the walk: ${ev.guard && ev.guard.armed ? "a test write and a test request to another address were both blocked in the browser" : "NOT CONFIRMED"}.`);
  L.push(`- Write attempts blocked in the browser: **${lo.blocked.filter((b) => b.kind === "http" && !/off-origin/.test(b.reason)).length}**.`);
  L.push(`- Requests to anywhere but the local copy, blocked: **${lo.blocked.filter((b) => /off-origin/.test(b.reason)).length}**${lo.blocked.some((b) => /off-origin/.test(b.reason)) ? ` (${[...new Set(lo.blocked.filter((b) => /off-origin/.test(b.reason)).map((b) => b.path))].slice(0, 3).join(", ")})` : ""}.`);
  L.push(`- Writes that reached the local copy's server: **${lo.reachedServer.length}**.`);
  L.push(`- Controls the newcomer chose not to press: ${lo.refusedPresses.length ? lo.refusedPresses.map((r) => `"${r.name}"`).join(", ") : "none came up"}.`);
  L.push("- The newcomer typed nothing.");
  if ((ev.unmocked || []).length) L.push(`- Calls the seed data did not know (the copy answered 404): ${ev.unmocked.join(", ")}. This is about the harness, not the app.`);
  L.push("");
  if (ev.model) {
    L.push("## The model newcomer");
    L.push("");
    if (!ev.model.vision.ok) {
      L.push("**NOT VERIFIED (blind).** The model could not read a word and a number from a test picture, so no trial ran. This says nothing about the product.");
    } else {
      L.push("A small local vision model, new to the app each time. It saw a screenshot with numbered controls (assisted) and the goal, never the check. The verdicts are the harness's own.");
      L.push("");
      ev.model.trials.forEach((t, i) => {
        const secs = (t.ms / 1000).toFixed(1);
        const notes = [t.refused.length ? `tried ${t.refused.length} control(s) it may not press` : "", t.disagreement ? "**it said done, and the check disagrees**" : "", t.reachedAt !== null && !t.noticed ? "it got there but did not notice" : ""].filter(Boolean).join("; ");
        L.push(`- Trial ${i + 1}: **${t.verdict}**. Ended: ${t.stop}. ${t.reachedAt !== null ? `Reached the goal at step ${t.reachedAt}. ` : ""}${t.steps.length} step(s), ${secs} s.${notes ? ` ${notes}.` : ""}`);
      });
      L.push("");
      L.push("One small model's stumble is evidence for a person to weigh, not a verdict on the product.");
    }
    L.push("");
  }
  L.push("## Coverage receipt");
  L.push("");
  L.push(`- Engine: Chromium ${ev.engine.version}, simulated. Desktop ${ev.engine.desktop} (keyboard). Phone ${ev.engine.phone} (touch emulation).`);
  L.push(ev.model ? "- Newcomer: scripted, plus a local vision model. Marks assist: numbered marks, for the model only." : "- Newcomer: scripted (no model). Marks assist: none.");
  L.push(`- Fixture: \`${journey.fixture_id}\`, loopback only, one-time nonce checked: ${ev.fixture.identity_ok ? "yes" : "NO"}.`);
  L.push(`- Product build: ${ev.build.label}.`);
  L.push("- Reduced motion: on for every pass.");
  L.push("- Physical phone: **UNKNOWN, not observed.**");
  L.push("- Real screen reader (NVDA, JAWS, VoiceOver): **UNKNOWN, not observed.** The accessible names above come from the browser's own tree.");
  L.push("- A person doing the journey: **UNKNOWN, not observed.**");
  L.push("- Live data and sign-in: **not used, by design.**");
  L.push("");
  L.push("## Screenshots");
  L.push("");
  if (!shots.length) L.push("None.");
  else L.push(`${shots.length} screenshot${shots.length === 1 ? "" : "s"} stayed with the run. Raw evidence is private, so no screenshot name or path appears in this shareable report.`);
  L.push("");
  L.push("Screenshots stay with the run (spec: raw evidence is private). They show made-up data only.");
  L.push("");
  L.push("## UNKNOWN");
  L.push("");
  f.unknowns.forEach((u) => L.push(`- ${u}`));
  L.push("- Whether a small vision model would do better or worse than this script: not run. None is available here.");
  L.push("");
  L.push("Findings are evidence, not pass/fail.");
  L.push("");
  return L.join("\n");
}

// Public repo and a report that may be pasted in a PR: refuse anything that looks like a real port, a machine
// path or a private address. Returns a list of reasons ([] means safe).
function findUnsafe(text) {
  const bad = [];
  if (/127\.0\.0\.1:\d{1,5}\b|localhost:\d{1,5}\b/.test(text)) bad.push("a loopback address with a real port");
  if (/(^|[\s`(])\/(home|var|Users|tmp|opt|run)\//.test(text)) bad.push("an absolute machine path");
  if (/\b(192\.168|10\.\d{1,3})\.\d{1,3}\.\d{1,3}\b/.test(text)) bad.push("a private network address");
  if (/\b172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/.test(text)) bad.push("a private network address");
  if (/\b0\.0\.0\.0\b/.test(text)) bad.push("a wildcard address");
  if (/\b169\.254\.\d{1,3}\.\d{1,3}\b/.test(text)) bad.push("a link-local address");
  // 127.0.0.0/8, except the documented `127.0.0.1:PORT` placeholder.
  if (/\b127\.\d{1,3}\.\d{1,3}\.\d{1,3}\b(?!:PORT\b|:\d{1,5}\b)/.test(text)) bad.push("a loopback address");
  if (/(^|[^\w:])::1(?![\w:])/.test(text)) bad.push("an IPv6 loopback address");
  if (/\b(?:fc|fd)[0-9a-f]{2}:[0-9a-f:]*\b/i.test(text)) bad.push("an IPv6 private address");
  if (/\.(lan|local|internal|home\.arpa)\b/.test(text)) bad.push("a private host name");
  if (/bearer\s+[A-Za-z0-9._~+/=-]{8,}/i.test(text)) bad.push("a bearer credential");
  return bad;
}

module.exports = { renderReport, verdictOf, findUnsafe };
