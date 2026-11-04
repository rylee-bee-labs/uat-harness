// The model newcomer (Gate 1 of the UAT plan). A small local vision model sees a screenshot with numbered controls and
// picks one. The harness decides what may be pressed and an oracle the model never sees decides the verdict.
//
// Runs that use the numbers are "assisted" (design D8): small models read numbers far better than they can give pixel
// coordinates. Screenshots go only to a model on this machine: a cloud endpoint is refused, because that is an owner
// decision. A reply that names no control is a failed step, never a guess.
"use strict";

const crypto = require("crypto");
const { canPress } = require("./newcomer.cjs");

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

function isLoopback(url) {
  try { return LOOPBACK.has(new URL(url).hostname); } catch (_) { return false; }
}

function buildPrompt({ goal, lastResult }) {
  return [
    `You are using this app for the first time. Your goal: ${goal}`,
    lastResult ? `What just happened: ${lastResult}` : "",
    "Each control you can press has a red number beside it. Which number do you press next?",
    "If you can already see that the goal is done, reply DONE. If you are stuck, reply GIVE UP.",
    "Otherwise say which number, and why, in a sentence or two.",
  ].filter(Boolean).join("\n");
}

// The only replies a step accepts: the numbers on this screen, DONE, GIVE UP. The server holds the model to this, so
// nothing has to be guessed from prose: on 2026-11-04 a prose reply saying "Home has the number 2" was read as a choice,
// and pressed the right control by accident. A JSON schema, because a grammar made the server fail on MiniCPM-V.
function replySchema(numbers) {
  return { type: "json_schema", json_schema: { schema: { type: "string", enum: [...numbers.map(String), "DONE", "GIVE UP"] } } };
}

// What did the model choose? A server that ignores the grammar can still send prose, which counts as no choice.
function parseChoice(reply, valid) {
  const text = String(reply || "").trim().replace(/^"(.*)"$/, "$1").trim();
  const known = new Set((valid || []).map(String));
  if (/^\d+$/.test(text)) return known.has(text) ? { kind: "press", number: text } : { kind: "invalid", number: text };
  if (/^done\.?$/i.test(text)) return { kind: "done" };
  if (/^give\s*up\.?$/i.test(text)) return { kind: "give-up" };
  return { kind: "none" };
}

async function chat({ url, model, prompt, image, maxTokens = 400, timeoutMs = 120000, temperature = 0, seed, responseFormat, follow = [] }) {
  const content = [];
  if (image) content.push({ type: "image_url", image_url: { url: `data:image/png;base64,${image.toString("base64")}` } });
  content.push({ type: "text", text: prompt });
  const t0 = Date.now();
  const res = await fetch(`${url.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ model: model || "local", temperature, max_tokens: maxTokens, messages: [{ role: "user", content }, ...follow], ...(responseFormat ? { response_format: responseFormat } : {}), ...(seed === undefined ? {} : { seed, cache_prompt: false }) }),
  });
  if (!res.ok) throw new Error(`model answered HTTP ${res.status}`);
  const j = await res.json();
  return {
    text: String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "").trim(),
    ms: Date.now() - t0,
    tokens: (j.usage && j.usage.completion_tokens) || 0,
  };
}

// Prove the model reads images: a word and a number only the picture carries (from VEFR's Agent Player Lab).
async function visionCheck({ url, model, browser }) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  try {
    await page.setContent('<body style="background:#111;color:#eee;font:64px sans-serif;display:grid;place-items:center;height:100vh;margin:0">OTTER 47</body>');
    await page.waitForTimeout(150);
    const image = await page.screenshot();
    const r = await chat({ url, model, image, prompt: "What word and what number are written in the image? Answer in a few words." });
    return { ok: /otter/i.test(r.text) && /47/.test(r.text), ms: r.ms };
  } finally { await page.close(); }
}

// Run in the page. Numbers every visible control a person could press, and returns what each one is.
function markInPage() {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const els = Array.from(document.querySelectorAll("a[href], button, [role=button], [role=link], summary, input, select, textarea"))
    .filter((el) => vis(el) && !el.disabled);
  return els.map((el, i) => {
    const r = el.getBoundingClientRect();
    const m = document.createElement("span");
    m.setAttribute("data-uat-mark", "");
    m.textContent = String(i + 1);
    m.style.cssText = `position:fixed;left:${Math.max(0, r.left - 8)}px;top:${Math.max(0, r.top - 10)}px;z-index:2147483647;background:#c00;color:#fff;font:bold 13px sans-serif;padding:1px 5px;border-radius:9px;pointer-events:none`;
    document.body.append(m);
    return {
      number: String(i + 1), x: r.left + r.width / 2, y: r.top + r.height / 2, tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") || "", href: el.getAttribute("href") || "", expanded: el.getAttribute("aria-expanded"),
      name: (el.getAttribute("aria-label") || el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
    };
  });
}

function clearInPage() {
  document.querySelectorAll("[data-uat-mark]").forEach((m) => m.remove());
}

async function screenState(page) {
  const text = await page.evaluate(() => document.body.innerText);
  return crypto.createHash("sha256").update(`${page.url()}\n${text}`).digest("hex").slice(0, 16);
}

// One fresh attempt. Returns the record; `oracle` runs afterwards, on the page as the model left it.
// `reached` is the hidden oracle: the harness asks it after every press, so a verdict never hangs on whether a toggle
// happened to end open. Once it is true the model gets one more look, to see whether it notices (DONE) on its own.
async function runTrial({ page, goal, url, model, reached, seed, temperature = 0.4, maxSteps = 8, stuckAfter = 3, deadlineMs = 180000, save }) {
  const t0 = Date.now();
  const steps = [];
  const refused = [];
  let stop = "step-cap";
  let lastResult = "";
  const seen = new Map();
  let reachedAt = null;
  for (let n = 1; n <= maxSteps; n++) {
    if (Date.now() - t0 > deadlineMs) { stop = "time-cap"; break; }
    const before = await screenState(page);
    const controls = await page.evaluate(markInPage);
    const image = await page.screenshot();
    await page.evaluate(clearInPage);
    if (save) await save(n, image);
    // Reason first, in its own words, then answer in the strict format. Forced to answer at once, both models tried
    // on 2026-11-04 pressed "1" on every trial.
    const prompt = buildPrompt({ goal, lastResult });
    const stepSeed = seed === undefined ? undefined : seed + n;
    const thought = await chat({ url, model, image, temperature, seed: stepSeed, prompt, maxTokens: 300 });
    const reply = await chat({
      url, model, image, temperature, seed: stepSeed, prompt, maxTokens: 12, responseFormat: replySchema(controls.map((c) => c.number)),
      follow: [{ role: "assistant", content: thought.text }, { role: "user", content: "Now give only your final answer." }],
    });
    const choice = parseChoice(reply.text, controls.map((c) => c.number));
    const record = { n, thought: thought.text.slice(0, 600), reply: reply.text.slice(0, 40), ms: thought.ms + reply.ms, tokens: thought.tokens + reply.tokens, choice: choice.kind, number: choice.number || null, controls: controls.length };
    steps.push(record);
    if (choice.kind === "done") { stop = "said-done"; break; }
    if (choice.kind === "give-up") { stop = "gave-up"; break; }
    if (reachedAt !== null) { stop = "did-not-notice"; break; }
    if (choice.kind !== "press") {
      lastResult = "That was not one of the numbers on the screen.";
    } else {
      const c = controls.find((x) => x.number === choice.number);
      record.pressed = c.name;
      const can = canPress(c);
      if (!can.ok) {
        refused.push({ name: c.name, why: can.why });
        record.refused = true;
        lastResult = `"${c.name}" cannot be pressed in this run.`;
      } else {
        await page.mouse.click(c.x, c.y);
        await page.waitForTimeout(600);
        const after = await screenState(page).catch(() => null);
        lastResult = after === before ? `You pressed "${c.name}". Nothing changed.` : `You pressed "${c.name}".`;
      }
    }
    if (reachedAt === null && reached && await reached(page)) reachedAt = n;
    // The same choice on a screen already seen, even if a toggle flips the screen back and forth in between.
    const key = `${before}:${choice.number || choice.kind}`;
    seen.set(key, (seen.get(key) || 0) + 1);
    if (reachedAt === null && seen.get(key) >= stuckAfter) { stop = "stuck"; break; }
  }
  return { stop, steps, refused, reachedAt, noticed: reachedAt !== null && stop === "said-done", ms: Date.now() - t0 };
}

module.exports = { replySchema, isLoopback, buildPrompt, parseChoice, chat, visionCheck, runTrial, markInPage };
