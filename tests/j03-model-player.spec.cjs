// J03: the model newcomer, driven by a scripted fake model so no real model is needed. The fake answers the eye test,
// then plays its script. Controls on the demo: Home has Home(1), Inbox(2), the waiting link(3); the Inbox has
// Home(1), Inbox(2), Approve now(3), the card(4).
"use strict";
const fs = require("fs");
const http = require("http");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { makeDemo } = require("./helpers/demo-journey.cjs");
const { run } = require("./helpers/run.cjs");

const CLI = path.resolve(__dirname, "..", "uat_journey.cjs");

async function fakeModel(script, { eyes = "OTTER 47" } = {}) {
  const prompts = [];
  let at = 0;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => { body += d; });
    req.on("end", () => {
      const j = JSON.parse(body);
      const text = j.messages[0].content.find((c) => c.type === "text").text;
      prompts.push(text);
      // A step asks twice: first to reason, then for the answer in the strict format. Only the answer plays the script.
      const content = /word and what number/.test(text) ? eyes : j.response_format ? script[at++ % script.length] : "Thinking it over.";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content } }], usage: { completion_tokens: 3 } }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, prompts, close: () => server.close() };
}

async function journey(script, opts = {}) {
  const demo = makeDemo({ asker: true });
  const model = await fakeModel(script, opts);
  const out = path.join(demo.root, "out");
  const res = await run(process.execPath, [CLI, demo.journey, "--dist", demo.dist, "--out", out, "--player", "model", "--trials", "1"], { timeout: 120000, env: { UAT_MODEL_URL: opts.url || model.url } });
  const read = (f) => fs.readFileSync(path.join(out, f), "utf8");
  return { demo, model, out, res, read };
}

test("J03: a model that opens the card passes by oracle, and the check is hidden from it", async () => {
  const { demo, model, res, read } = await journey(["2", "4", "DONE"]);
  try {
    expect(res.status, res.stderr).toBe(0);
    const t = JSON.parse(read("summary.json")).model_newcomer.trials[0];
    expect(t).toMatchObject({ verdict: "PASS", stop: "said-done", steps: 3, disagreement: false, reached_at: 2, noticed: true });
    for (const p of model.prompts) expect(p).not.toMatch(/moss-agent|oracle/);   // the asker is only behind the card
    expect(read("report.md")).toMatch(/Marks assist: numbered marks/);
  } finally { model.close(); demo.cleanup(); }
});

test("J03: reaching the goal counts even if it toggles on, and not noticing is recorded", async () => {
  const { demo, model, res, read } = await journey(["2", "4", "4", "4", "4"]);
  try {
    expect(res.status, res.stderr).toBe(0);
    const t = JSON.parse(read("summary.json")).model_newcomer.trials[0];
    // One more look after it got there, in which it pressed again: a pass, and it never knew. An even press count must not matter.
    expect(t).toMatchObject({ verdict: "PASS", stop: "did-not-notice", steps: 3, reached_at: 2, noticed: false });
    expect(read("report.md")).toMatch(/it got there but did not notice/);
  } finally { model.close(); demo.cleanup(); }
});

test("J03: flipping a toggle that never reaches the goal ends as stuck, even though the screen keeps changing", async () => {
  const demo = makeDemo({ asker: false });
  const model = await fakeModel(["2", "4", "4", "4", "4", "4", "4", "4"]);
  const out = path.join(demo.root, "out");
  try {
    const res = await run(process.execPath, [CLI, demo.journey, "--dist", demo.dist, "--out", out, "--player", "model", "--trials", "1"], { timeout: 120000, env: { UAT_MODEL_URL: model.url } });
    expect(res.status, res.stderr).toBe(0);
    const t = JSON.parse(fs.readFileSync(path.join(out, "summary.json"), "utf8")).model_newcomer.trials[0];
    expect(t).toMatchObject({ verdict: "FAIL", stop: "stuck", reached_at: null, noticed: false });
  } finally { model.close(); demo.cleanup(); }
});

test("J03: a model that says done at once fails, and the disagreement is a finding", async () => {
  const { demo, model, res, read } = await journey(["DONE"]);
  try {
    expect(res.status, res.stderr).toBe(0);
    const t = JSON.parse(read("summary.json")).model_newcomer.trials[0];
    expect(t).toMatchObject({ verdict: "FAIL", stop: "said-done", disagreement: true });
    expect(read("report.md")).toMatch(/it said done, and the check disagrees/);
  } finally { model.close(); demo.cleanup(); }
});

test("J03: a server that ignores the format and sends prose gets no press", async () => {
  const { demo, model, res, read, out } = await journey(["The Inbox has the number 2, so I would go there."]);
  try {
    expect(res.status, res.stderr).toBe(0);
    const t = JSON.parse(read("summary.json")).model_newcomer.trials[0];
    expect(t.reached_at).toBe(null);
    expect(t.verdict).toBe("FAIL");
    const steps = JSON.parse(read("private/evidence.json")).model.trials[0].steps;
    expect(steps.every((s) => s.choice === "none" && !s.pressed)).toBe(true);
  } finally { model.close(); demo.cleanup(); }
});

test("J03: a control that writes is refused, nothing reaches the server, and the model is told", async () => {
  const { demo, model, res, read } = await journey(["2", "3", "GIVE UP"]);
  try {
    expect(res.status, res.stderr).toBe(0);
    const s = JSON.parse(read("summary.json"));
    expect(s.model_newcomer.trials[0]).toMatchObject({ stop: "gave-up", refused: 1 });
    expect(s.look_only.reached_server).toBe(0);
    expect(model.prompts.some((p) => /"Approve now" cannot be pressed/.test(p))).toBe(true);
  } finally { model.close(); demo.cleanup(); }
});

test("J03: pressing the same dead thing again and again ends as stuck", async () => {
  const { demo, model, res, read } = await journey(["1"]);
  try {
    expect(res.status, res.stderr).toBe(0);
    expect(JSON.parse(read("summary.json")).model_newcomer.trials[0].stop).toBe("stuck");
  } finally { model.close(); demo.cleanup(); }
});

test("J03: a model that cannot read the test picture is NOT VERIFIED (blind), and no trial runs", async () => {
  const { demo, model, res, read } = await journey(["2"], { eyes: "I see a dark rectangle" });
  try {
    expect(res.status, res.stderr).toBe(0);
    const m = JSON.parse(read("summary.json")).model_newcomer;
    expect(m.vision_ok).toBe(false);
    expect(m.trials).toEqual([]);
    expect(read("report.md")).toMatch(/NOT VERIFIED \(blind\)/);
  } finally { model.close(); demo.cleanup(); }
});

test("J03: a cloud endpoint is refused before anything runs", async () => {
  const { demo, model, res, out } = await journey(["2"], { url: "https://example.com/v1" });
  try {
    expect(res.status).toBe(2);
    expect(res.stderr + res.stdout).toMatch(/NOT RUN \(tier not allowed\)/);
    expect(fs.existsSync(path.join(out, "report.md"))).toBe(false);
    expect(model.prompts).toEqual([]);
  } finally { model.close(); demo.cleanup(); }
});

test("J03: model screenshots stay in private/", async () => {
  const { demo, model, res, out } = await journey(["2", "4", "DONE"]);
  try {
    expect(res.status, res.stderr).toBe(0);
    const shots = fs.readdirSync(path.join(out, "private", "screens")).filter((f) => f.startsWith("model-"));
    expect(shots.length).toBe(3);
    expect(fs.readdirSync(out).filter((f) => f.endsWith(".png"))).toEqual([]);
  } finally { model.close(); demo.cleanup(); }
});
