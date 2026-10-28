# Journey Mode — Phase 1 (proof) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A small local vision model, using only ordinary touch input, attempts three plain-language goals on an
authorized, isolated Project Home fixture and leaves an honest, redacted per-goal record, then shows an observable
improvement after one real usability fix.

**Architecture:** A new `journey` entry point in uat-harness beside the existing sweep driver. Small single-purpose
modules under `lib/journey/` (deck, persona, settings, fixture gate, browser body, model client, player, verifier,
trial loop, witness/report). The fixture boundary reuses `lib/policy.cjs` + `lib/netpolicy.cjs` CDP `Fetch`
policing with a new fixture decision; finalization reuses `lib/artifacts.cjs`. Project Home gets a loopback fixture
server, a deck, settings and one oracle in its own repo.

**Tech Stack:** Node 22 CommonJS (`.cjs`), `@playwright/test` (Chromium only), `node:test`, `yaml` (new runtime
dependency), any OpenAI-compatible chat endpoint (e.g. a local Ollama `/v1`).

**Spec:** `docs/superpowers/specs/2026-10-28-human-shaped-uat-design.md` (Phase 1 row of §8; §4, §5, §10).

## Global Constraints

- Chromium only. No WebKit, no second persona, no `doctor/init/plan/explain/retest`, no adoption gates, no tool
  retirement in this phase (spec §8).
- Findings never set the exit code. Exit `0` = run completed (any verdicts). Exit `2` = run could not start
  (NOT RUN at run level). Exit `1` reserved for internal crashes.
- Journeys run **only** against an authorized fixture: origin listed in `UAT_FIXTURE_ORIGINS` (exact
  scheme://host:port, comma-separated), started by the harness, answering `fixture_id` + one-time nonce at
  `/.well-known/uat-fixture` (spec §10.1). Product settings and `UAT_TARGET` never authorize.
- The player never sees the outcome line, the oracle name, selectors, or other goals.
- Statuses spelled exactly: `PASS`, `FAIL`, `UNKNOWN`, `NOT RUN (<reason>)`, `NOT VERIFIED (<reason>)`.
  `verified_by` ∈ `oracle | judge | none`.
- Shareable output = `report.md`, `summary.json` only (text). Raw screenshots, trees, prompts under `private/`.
  Nothing writes images outside `private/`.
- Screenshots are viewport-only at `deviceScaleFactor: 1`, so screenshot pixels = CSS pixels = tap coordinates.
- `@playwright/test`, `axe-core`, `adm-zip`, `yaml` stay in `dependencies` (AGENTS.md rule 6).
- Public repo: examples use `http://127.0.0.1:PORT/` literally; no hostnames, real ports, LAN IPs, model hostnames
  or machine paths in tracked files (AGENTS.md rule 7).
- The existing sweep driver (`uat_driver.cjs`, `uat.py`) and E01/E02/E03 behaviour are unchanged.

## Review Focus

1. **The model answers in prose, malformed JSON, or coordinates off-screen** → recorded as friction (cause
   *model/vision*), never a crash; off-screen taps refused. Pinned in Task 6 and Task 5.
2. **The fixture never comes up (port in use, crash, hang)** → `NOT RUN (fixture did not start)` within 30 s and
   the child process is killed. Pinned in Task 4.
3. **The app opens a same-origin link in a new tab** → the body follows the newest page; an off-origin popup is
   closed and recorded. Pinned in Task 10.
4. **The run is interrupted (Ctrl-C / SIGTERM)** → fixture process killed, nothing promoted out of `.staging`.
   Pinned in Task 9.
5. **The model endpoint is slow or erroring** → 60 s per call; 3 consecutive failures end the trial
   `model_error`, verdict decided by oracle if present else `UNKNOWN`, cause *harness*. Pinned in Task 8.

---

## File structure

uat-harness (branch `feat/journey-phase1`, from `docs/human-shaped-uat-spec`):

| File | Responsibility |
|---|---|
| `lib/journey/deck.cjs` | Parse a deck; split player text from outcome/oracle |
| `lib/journey/persona.cjs` | Parse a persona file |
| `lib/journey/settings.cjs` | Load product `uat/settings.yaml` + env overrides; spend (tier) gate |
| `lib/policy.cjs` (modify) | Add pure `decideFixtureRequest` |
| `lib/netpolicy.cjs` (modify) | Add `installFixturePolicy` (CDP Fetch, popups, WebSockets) |
| `lib/journey/fixture.cjs` | Authorization check, start/verify/stop fixture process |
| `lib/journey/body.cjs` | Browser body: `see/act/reset/identity/close` |
| `lib/journey/model.cjs` | OpenAI-compatible client + scripted fake |
| `lib/journey/player.cjs` | Build player/judge/sanity prompts; parse replies |
| `lib/journey/verify.cjs` | Run oracle; combine oracle/judge into a verdict |
| `lib/journey/trial.cjs` | One goal attempt loop, caps, stuck detection, friction |
| `lib/journey/witness.cjs` | Write private step evidence into staging |
| `lib/journey/report.cjs` | Render `report.md`, build `summary.json` (pure) |
| `uat_journey.cjs` | CLI: preflight → sanity → trials → verify → report → finalize |
| `personas/phone-first-timer.md` | The one Phase 1 persona |
| `scripts/check-syntax.cjs` | `node --check` over every `.cjs` (replaces the hand list in `check`) |
| `tests/unit/journey-*.test.cjs` | Browser-free tests per module |
| `tests/j01-journey.spec.cjs`, `tests/helpers/demo-fixture.cjs` | Browser fixtures |

project-home (separate branch/PR `feat/uat-fixture`):

| File | Responsibility |
|---|---|
| `scripts/uat-target` | Loopback fixture server: `web/dist` + canned `/api` + identity + state file |
| `uat/fixture-data.json` | Synthetic canned API responses |
| `uat/settings.yaml`, `uat/decks/first-week.md` | Settings + 3-goal deck |
| `uat/oracles/settings-reached` | Oracle for G2 |

---

### Task 1: Deck, persona and settings parsing

**Files:**
- Create: `lib/journey/deck.cjs`, `lib/journey/persona.cjs`, `lib/journey/settings.cjs`, `personas/phone-first-timer.md`, `scripts/check-syntax.cjs`
- Modify: `package.json` (add `"yaml": "^2.8.0"` to `dependencies`; `"check": "node scripts/check-syntax.cjs"`; `"journey": "node uat_journey.cjs"`)
- Test: `tests/unit/journey-config.test.cjs`

**Interfaces:**
- Produces:
  - `parseDeck(text: string, name: string) → { name, personas: string[], writes: boolean, covers: string[], goals: Goal[] }`
    where `Goal = { id: "G1", title, playerText, outcome, oracle: string|null }`. Throws `ConfigError` on a goal
    without an outcome line or a deck without goals.
  - `playerView(goal) → { id, title, text }` (no outcome, no oracle).
  - `parsePersona(text, name) → { name, senses: string[], hands: string[], engine: "chromium", viewport: {width, height}, modelTier, patience: {steps, minutes, stuckAfter}, trials, assist, character }`.
  - `loadSettings(productDir, env) → { target, start, fixtureId, sanityExpect, allowedTiers: string[], budgetUsdPerRun, judgeTier: string|null }`.
  - `checkTierAllowed(tier, settings) → { ok: boolean, reason }` — default `["small-local"]` when unset; `UAT_MODEL_TIERS` env (comma list) overrides.
  - `class ConfigError extends Error`.

Deck syntax (spec §5): YAML front matter; each `## G<n> · <title>` section; the line starting
`**You'll know it worked when:**` is the outcome; `**Oracle:** <name>` optional; all other lines are player text.
Settings keys: `target`, `start`, `fixture_id`, `sanity: { expect }`, `models: { allowed_tiers, budget_usd_per_run, judge_tier }`.

- [ ] **Step 1: Write failing tests** in `tests/unit/journey-config.test.cjs`:
  - `parseDeck` on the spec §5 example → 1 goal, `outcome === "you can say how many items wait on you, or that none do."`, `oracle === "waiting-count"`, and `playerView(goal).text` contains neither `"know it worked"` nor `"waiting-count"`.
  - goal with no outcome line → throws `ConfigError` naming the goal id.
  - `parsePersona` on `personas/phone-first-timer.md` → `viewport` `{width: 390, height: 844}`, `hands` `["touch"]`, `patience.stuckAfter === 5`, `trials === 1`, `character` starts `"You've never used this app."`.
  - `loadSettings` with env `UAT_TARGET=http://127.0.0.1:9/` → `target` overridden; `checkTierAllowed("cloud-cheap", {allowedTiers: ["small-local"]}).ok === false`.
- [ ] **Step 2:** `npm run test:unit` → new tests FAIL (modules missing).
- [ ] **Step 3:** Implement the three modules (use `yaml`'s `parse` for front matter and settings) and the persona file (spec §5 example, but `engine: chromium`, `trials: 1`, `assist: none`). Write `scripts/check-syntax.cjs`: spawn `node --check` on `uat_driver.cjs`, `uat_journey.cjs` if present, and every `lib/**/*.cjs`; exit non-zero on the first failure.
- [ ] **Step 4:** `npm install && npm run check && npm run test:unit` → all PASS.
- [ ] **Step 5:** Commit `feat(journey): deck, persona and settings parsing`.

### Task 2: Fixture request decision (pure)

**Files:**
- Modify: `lib/policy.cjs`
- Test: `tests/unit/policy.test.cjs` (append)

**Interfaces:**
- Produces: `decideFixtureRequest({ url, method, fixtureOrigin, allowWrites }) → { action: "continue"|"abort", reason }`.
  Rules, in order: unparseable/non-http(s) URL other than `data:`/`blob:` → abort `"fixture: unparseable url"`;
  `data:`/`blob:` → continue; `normalizeOrigin(url) !== normalizeOrigin(fixtureOrigin)` → abort
  `"fixture: off-origin request"`; method not GET/HEAD/OPTIONS and `!allowWrites` → abort
  `"read-only: <METHOD> HTTP method blocked"`; else continue `"fixture origin"`.

- [ ] **Step 1:** Tests: off-origin GET aborts; same-origin POST aborts when `allowWrites:false`, continues when `true`; `http://127.0.0.1:8790` vs `http://127.0.0.1:8791` aborts; `data:image/png;base64,AA` continues.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement and export.
- [ ] **Step 4:** Run → PASS (existing policy tests still pass).
- [ ] **Step 5:** Commit `feat(policy): fixture-bound request decision`.

### Task 3: Fixture network policy (browser glue)

**Files:**
- Modify: `lib/netpolicy.cjs`
- Test: covered in Task 10 (browser); here only `npm run check`.

**Interfaces:**
- Consumes: `decideFixtureRequest` (Task 2).
- Produces: `installFixturePolicy(context, { fixtureOrigin, allowWrites, onBlock }) → Promise<{ attachPage(page): Promise<void> }>`.
  Always uses CDP `Fetch` (redirect hops re-checked); `onBlock({ kind: "http"|"websocket"|"popup", method, path, reason })`.
  WebSockets: `context.routeWebSocket` — off-origin → `ws.close()` + onBlock; same origin → `ws.connectToServer()`.
  Popups: on `context.on("page")`, attach before first navigation; after the page's first `domcontentloaded` or
  failed load, if `normalizeOrigin(page.url())` is not the fixture origin (ignore `about:blank` until navigated),
  `page.close()` + onBlock `kind: "popup"`.

- [ ] **Step 1:** Refactor `installCdpRequestPolicy`'s paused-request handler to take a `decide(ev) → decision` function so both the auth policy and the fixture policy share the same CDP plumbing; behaviour of the auth path unchanged.
- [ ] **Step 2:** Add `installFixturePolicy` with the rules above.
- [ ] **Step 3:** `npm run check && npm run test:unit && npm run test:browser` → E01/E02/E03 still PASS.
- [ ] **Step 4:** Commit `feat(netpolicy): fixture policy over CDP Fetch, popups and WebSockets`.

### Task 4: Fixture gate (authorize, start, verify, stop)

**Files:**
- Create: `lib/journey/fixture.cjs`
- Test: `tests/unit/journey-fixture.test.cjs`

**Interfaces:**
- Produces:
  - `resolveTarget(settings, env) → { url, origin }` — replaces literal `PORT` with `env.UAT_FIXTURE_PORT`; missing port → `ConfigError`.
  - `authorizeOrigin(origin, env) → { ok, reason }` — exact match against `UAT_FIXTURE_ORIGINS` after `normalizeOrigin`; empty/unset list → `{ok:false, reason:"no authorized fixture origins on this machine"}`.
  - `startFixture({ productDir, start, port, nonce, stateFile, timeoutMs = 30000, fetchImpl }) → Promise<{ stop(): Promise<void>, origin }>` — spawns `start` (resolved relative to `productDir`, no shell) with env `UAT_FIXTURE_PORT`, `UAT_FIXTURE_NONCE`, `UAT_FIXTURE_STATE_FILE`; polls `GET <origin>/.well-known/uat-fixture` every 250 ms; rejects with `FixtureError("fixture did not start")` on timeout or early child exit, killing the child (SIGTERM, then SIGKILL after 3 s).
  - `verifyIdentity(body, { fixtureId, nonce }) → { ok, reason }` — body must be JSON `{ fixture_id, nonce }` with both equal.
  - `class FixtureError extends Error`.

- [ ] **Step 1:** Tests: `authorizeOrigin("http://127.0.0.1:8790", {UAT_FIXTURE_ORIGINS:"http://127.0.0.1:8790"}).ok === true`; same origin with list `http://127.0.0.1:8791` → false; `UAT_TARGET` pointing at an unlisted origin → false; `verifyIdentity` wrong nonce → `ok:false, reason` mentions nonce; `startFixture` with a `start` script that exits immediately → rejects `FixtureError` within 2 s; a script that never listens with `timeoutMs: 500` → rejects and the child pid is no longer alive. (Test scripts written to a temp dir.)
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(journey): fixture authorization, identity and lifecycle`.

### Task 5: Browser body

**Files:**
- Create: `lib/journey/body.cjs`
- Test: covered in Task 10.

**Interfaces:**
- Consumes: `installFixturePolicy` (Task 3), persona (Task 1).
- Produces: `createBrowserBody({ browser, persona, startUrl, fixtureOrigin, allowWrites, onBlock }) → Promise<Body>`:
  - `reset() → Promise<void>` — closes any context; new context `{ viewport, deviceScaleFactor: 1, isMobile: hands includes "touch", hasTouch: hands includes "touch", serviceWorkers: "block" }`; installs fixture policy; attaches page; `page.goto(startUrl, { waitUntil: "domcontentloaded" })`.
  - `see() → Promise<{ png: Buffer, tree: string, url: string, hash: string }>` — viewport screenshot; `tree` from `page.locator("body").ariaSnapshot()` (empty string on error); `hash` = sha256 of png. Always observes the newest open page.
  - `act(action) → Promise<{ ok: boolean, note: string }>` — supports `tap{x,y}` (touch only, `page.touchscreen.tap`), `click{x,y}` (mouse only), `type{text}`, `key{key}`, `scroll{x,y,dx,dy}` (touch: `page.mouse.wheel` at point is acceptable; record it), `wait{ms ≤ 2000}`. Refuse with `ok:false` when the action's input kind isn't in `persona.hands`, or `x/y` outside the viewport. Waits up to 1 s for network idle after each action.
  - `identity() → { engine: "chromium", version, viewport, deviceScaleFactor: 1, device: "simulated", input: "touch emulation" | "mouse" | "keyboard", assistiveTech: "none" }`.
  - `close() → Promise<void>`.

- [ ] **Step 1:** Implement per the interface.
- [ ] **Step 2:** `npm run check` → PASS.
- [ ] **Step 3:** Commit `feat(journey): browser body with ordinary input only`.

### Task 6: Model client and player prompts

**Files:**
- Create: `lib/journey/model.cjs`, `lib/journey/player.cjs`
- Test: `tests/unit/journey-player.test.cjs`

**Interfaces:**
- Produces:
  - `createModelClient({ tier, env, fetchImpl, timeoutMs = 60000 }) → { tier, name, local: boolean, chat(messages) → Promise<{ text, usage: { prompt, completion } }> }` — endpoint `UAT_MODEL_<TIER>_URL` (tier upper-cased, `-`→`_`), model `UAT_MODEL_<TIER>_NAME`, optional `UAT_MODEL_<TIER>_KEY` as bearer; `local` = endpoint host is loopback or `UAT_MODEL_<TIER>_LOCAL=1`. POSTs `<url>/chat/completions`. Missing URL → `ModelUnavailable`.
  - `createScriptedModel(replies: string[]) → same shape` (returns replies in order; used by tests and CI).
    `createModelClient` returns a scripted model when the URL is `scripted:<path-to-json-array>` (test-only hook,
    documented as such; `local: true`).
  - `buildPlayerMessages({ persona, goal: playerView, observation: {png, tree}, notes: string[], step }) → messages[]` — system = persona character + rules ("reply with ONE JSON object"; list only the action types the persona's hands allow; screenshot is W×H, coordinates in pixels from top-left); user = goal text + notes + image (data URL) when `senses` includes `screenshot` + tree when it includes `a11y-tree`.
  - `parsePlayerReply(text) → { action, note, friction } | { invalid: true, raw }` — extracts the first `{…}` JSON; `action.type` ∈ `tap|click|type|key|scroll|wait|done|give_up`; `done` carries `answer`, `give_up` carries `reason`.
  - `buildSanityMessages(observation) → messages[]` ("Name one word or short phrase you can read on this screen.").
  - `buildJudgeMessages({ goal: Goal, observation, playerEnd: { type, answer } }) → messages[]`; `parseJudgeReply(text) → { verdict: "pass"|"fail"|"unknown", reason }` (unparseable → `unknown`, reason `"judge reply unparseable"`).

- [ ] **Step 1:** Tests: `parsePlayerReply('Sure! {"action":{"type":"tap","x":10,"y":20},"friction":"no labels"}')` → tap at 10,20 with friction text; prose with no JSON → `invalid:true`; unknown type `"swipe"` → `invalid:true`; `buildPlayerMessages` output contains the goal text and does **not** contain the outcome string or oracle name (feed a full `Goal`, pass `playerView(goal)`); persona with `hands:["touch"]` → system prompt lists `tap` and not `click`; `createModelClient` with no URL env → throws `ModelUnavailable`; `parseJudgeReply("PASS because…")` without JSON → `unknown`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(journey): model client and player/judge prompts`.

### Task 7: Verifier

**Files:**
- Create: `lib/journey/verify.cjs`
- Test: `tests/unit/journey-verify.test.cjs`

**Interfaces:**
- Produces:
  - `runOracle({ productDir, name, stateFile, timeoutMs = 10000 }) → Promise<{ verdict: "pass"|"fail"|"unknown", reason }>` — executes `uat/oracles/<name>` (no shell) with env `UAT_FIXTURE_STATE_FILE`; first stdout line `pass|fail|unknown <reason>`; non-zero exit, timeout or bad output → `unknown` with that reason.
  - `decideVerdict({ oracle: {verdict, reason}|null, judge: {verdict, reason}|null, playerEnd }) → { verdict: "PASS"|"FAIL"|"UNKNOWN", verifiedBy: "oracle"|"judge"|"none", reason, disagreement: boolean }` —
    oracle `pass/fail` decides; else judge `pass/fail` decides; else `UNKNOWN`/`none`.
    `disagreement = (playerEnd.type === "done") !== (verdict === "PASS")`, false when verdict is `UNKNOWN`.

- [ ] **Step 1:** Tests: oracle fail + judge pass + player done → `FAIL`, `oracle`, `disagreement:true`; oracle null + judge unknown → `UNKNOWN`, `none`; player give_up + oracle pass → `PASS`, `disagreement:true`; `runOracle` with a script printing `garbage` → `unknown`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(journey): oracle-first verifier`.

### Task 8: Trial loop

**Files:**
- Create: `lib/journey/trial.cjs`
- Test: `tests/unit/journey-trial.test.cjs`

**Interfaces:**
- Consumes: Body (Task 5), model client + player (Task 6).
- Produces: `runTrial({ body, model, persona, goal, recordStep, now = Date.now }) → Promise<Trial>` where
  `Trial = { end: "done"|"give_up"|"cap_steps"|"cap_time"|"stuck"|"model_error", playerEnd: {type, answer, reason}, steps: number, friction: Friction[], usage: {prompt, completion}, final: observation }` and
  `Friction = { step, kind: "invalid_reply"|"refused_action"|"no_visible_change"|"player_reported"|"stuck"|"cap"|"model_error", cause: "product"|"model/vision"|"actuation"|"harness", text }`.
  Loop: `see` → messages → `chat` → parse → `act` → `see` (for change detection). `recordStep(step, { observation, reply, action, result, ms, usage })` called every step.
  Cause mapping: invalid_reply → model/vision; refused_action → model/vision; no_visible_change → actuation; player_reported → product; stuck/cap → product; model_error → harness.
  Stuck: `persona.patience.stuckAfter` consecutive acting steps with unchanged `hash` and `url`. Model errors: 3 consecutive `chat` failures → `model_error`.

- [ ] **Step 1:** Tests with a fake body (hash sequence controllable) and `createScriptedModel`: scripted `tap`,`tap`,`done` → `end:"done"`, 3 steps, `recordStep` called 3×; five taps with unchanged hash and `stuckAfter:5` → `end:"stuck"` with a `stuck` friction; `steps:2` cap → `cap_steps`; a model whose `chat` rejects 3× → `model_error`; a prose reply then `done` → one `invalid_reply` friction (cause `model/vision`), trial still ends `done`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(journey): trial loop with caps, stuck and friction`.

### Task 9: Witness, report and CLI

**Files:**
- Create: `lib/journey/witness.cjs`, `lib/journey/report.cjs`, `uat_journey.cjs`
- Test: `tests/unit/journey-report.test.cjs`

**Interfaces:**
- Consumes: everything above; `finalizeArtifacts`, `stageDirFor` (`lib/artifacts.cjs`).
- Produces:
  - `createWitness(stageDir) → { recordStep(goalId, trial, step, data), writeShareable(files: {name: string → text}) }` — step evidence to `private/goals/<G>/trial-<k>/step-NN.png`, `tree-NN.txt`, and one appended line per step in `steps.jsonl` (reply text, action, result, ms, usage; **no** base64 image).
  - `buildSummary(run) → object` — `{ run_id, started_at, harness_sha, product: {dir_name, build_sha}, fixture_id, deck: {name, sha256}, persona: {name, sha256}, model: {tier, name, local}, judge, coverage, status, goals: [{ id, title, trials: [{ verdict, verified_by, end, steps, disagreement, friction_count }] }] }`.
  - `renderReport(run) → string` — header with run status + coverage receipt (spec §4 wording; physical device and real AT listed as `UNKNOWN — not observed`); a per-goal table (`G1 | title | PASS | oracle | done | 7 steps`); friction list per goal with step numbers and cause tags; a closing line "Findings are evidence, not pass/fail."
  - CLI `node uat_journey.cjs <product-dir> [--deck NAME] [--persona NAME] [--trials N] [--out DIR]`:
    1. load deck (default: only deck in `uat/decks/`), persona (default: deck's first persona), settings;
    2. `checkTierAllowed` → else `NOT RUN (tier not allowed)`;
    3. resolve + `authorizeOrigin` → else `NOT RUN (unauthorized target)`;
    4. `startFixture` with a fresh `crypto.randomUUID()` nonce and state file under staging `private/` → else `NOT RUN (fixture did not start)`;
    5. `verifyIdentity` → else `NOT RUN (unauthorized target)`;
    6. model client → else `NOT RUN (no model)`;
    7. sanity: one `see` + sanity chat; answer must contain `settings.sanityExpect` (case-insensitive) → else `NOT VERIFIED (blind)` and stop;
    8. per goal × trials: restart fixture (fresh state) + `body.reset()` → `runTrial` → `runOracle` (if goal has one) → judge (if no decisive oracle; tier `judgeTier` or player tier) → `decideVerdict`;
    9. write `report.md` + `summary.json` into staging, `finalizeArtifacts(outDir, env.UAT_TOKEN || "")`;
    10. exit `0`, or `2` for any run-level NOT RUN/NOT VERIFIED (report still written).
    SIGINT/SIGTERM: stop fixture, close browser, delete staging, exit 130. Default `--out`: `runs/<deck>-<UTC timestamp>`.

- [ ] **Step 1:** Tests for `renderReport`/`buildSummary` with a hand-built run: report contains `UNKNOWN — not observed` for physical device and for screen reader; table row `| G2 |` shows `PASS | oracle`; summary has no key whose value contains `.png`; a run with status `NOT RUN (no model)` renders that status in the first 5 lines.
- [ ] **Step 2:** FAIL. **Step 3:** Implement witness, report, CLI. **Step 4:** PASS; `npm run check` PASS.
- [ ] **Step 5:** Commit `feat(journey): witness, report and journey CLI`.

### Task 10: Browser fixtures for the journey

**Files:**
- Create: `tests/helpers/demo-fixture.cjs` (tiny loopback app + `start` script + oracle), `tests/j01-journey.spec.cjs`

**Interfaces:**
- Consumes: the CLI and modules; scripted replies via `UAT_MODEL_SMALL_LOCAL_URL=scripted:<path-to-json>` (Task 6).

Demo app: `/` shows heading "Demo Home" and a "Settings" link at (fixed CSS position) that navigates to `/settings`; `/settings` heading "Settings"; `/away` 302 → off-origin; `/popup` opens `window.open("http://127.0.0.1:<other>/")`; state file records every request path. Oracle `settings-reached`: `pass` if `/settings` in state, else `fail`.

- [ ] **Step 1:** Write specs, each running the CLI as a child process against the demo product with a fixed port and `UAT_FIXTURE_ORIGINS` set:
  - scripted player taps Settings then `done` → exit 0, `summary.json` G1 verdict `PASS`, `verified_by: "oracle"`.
  - scripted player says `done` on Home without tapping → `FAIL`, `oracle`, `disagreement: true`.
  - `UAT_TARGET` override to an unlisted origin → exit 2, report status `NOT RUN (unauthorized target)`, and the demo server was never contacted.
  - scripted player taps a link to `/away` → a `http` block with reason `fixture: off-origin request` recorded; off-origin popup → `popup` block recorded and page closed; same-origin `target=_blank` → next `see()` observes the new page.
  - demo `start` serving a blank page with sanity reply `"nothing"` → exit 2, `NOT VERIFIED (blind)`.
  - after any run: no `*.png` outside `<out>/private/`; no `.staging` left behind.
  - SIGTERM sent mid-run (scripted model with a 5 s `wait`) → fixture port closed within 5 s, no `<out>/report.md`.
- [ ] **Step 2:** `npm run test:browser` → FAIL, then fix until PASS. E01/E02/E03 still PASS.
- [ ] **Step 3:** Commit `test(journey): browser fixtures for gate, verdicts, popups, privacy`.

### Task 11: Docs for the new mode

**Files:**
- Modify: `AGENTS.md` (map: `uat_journey.cjs`, `lib/journey/`; rule: journeys only against authorized fixtures), `docs/agent-reference.md` (commands + env vars: `UAT_FIXTURE_ORIGINS`, `UAT_FIXTURE_PORT`, `UAT_TARGET`, `UAT_MODEL_<TIER>_URL/_NAME/_KEY/_LOCAL`, `UAT_MODEL_TIERS`, `UAT_JUDGE_TIER`; exit codes), `README.md` (short "Journey mode (Phase 1, experimental)" section), `.gitignore` (confirm `runs/` covered), spec status line → `Approved 2026-10-28; Phase 1 in progress`.

- [ ] **Step 1:** Edit the docs. Every example uses `http://127.0.0.1:PORT/` and placeholder model URLs.
- [ ] **Step 2:** `npm run check && npm test` → PASS; public-safety grep (`grep -rnE "192\.168\.|[a-z0-9-]+\.(lan|local|internal)\b|/home/|/Users/" -- . ':!node_modules'`) → no hits in tracked files.
- [ ] **Step 3:** Commit `docs(journey): document journey mode, env and exit codes`; push; open draft PR against `main` (stacked on #42).

### Task 12: Project Home fixture, deck and oracle (project-home repo)

**Files:**
- Create: `scripts/uat-target` (node, executable), `uat/fixture-data.json`, `uat/settings.yaml`, `uat/decks/first-week.md`, `uat/oracles/settings-reached`
- Test: `tests/ui/uat_target_unit.js` (wired into `web` `pnpm test` gates per `tests/ui/run_gates.js`)

**Interfaces:**
- Fixture contract (consumed by Task 4): reads `UAT_FIXTURE_PORT`, `UAT_FIXTURE_NONCE`, `UAT_FIXTURE_STATE_FILE` (refuses to start if any missing); binds `127.0.0.1` only; serves built `web/dist` with SPA fallback (as `serveDist` in `tests/ui/whats_live_walk.js`); `GET /.well-known/uat-fixture` → `{ "fixture_id": "project-home-mocked", "nonce": <env> }`; `/api/*` answered from `uat/fixture-data.json` keyed `"METHOD /path"` (signed-in synthetic owner for `/api/auth/me`; data adapted from `calm_home_walk.js` / `needs_you_walk.js` mocks, canary values only); every request appended to the state file as `{ method, path, mocked: boolean }`; unmocked `/api` → 404 `{"error":"not in fixture"}`.
- Deck (`first-week.md`, persona `phone-first-timer`, `writes: false`):
  - G1 · See what needs me (spec §5 example, judge-verified)
  - G2 · Change how often you're notified — outcome "the notification settings are on screen"; `**Oracle:** settings-reached`
  - G3 · Is anything stuck? — "Find out whether any of your work is stuck and needs a nudge." outcome "you can name what is stuck, or say nothing is"
- Oracle `settings-reached`: reads the state file; `pass` if a request for the notification-preferences endpoint the Settings screen loads (`GET /api/boops/prefs` — confirm by opening Settings in the built app) is present, else `fail`.
- Settings: `target: http://127.0.0.1:PORT/`, `start: scripts/uat-target`, `fixture_id: project-home-mocked`, `sanity: { expect: "Project Home" }` (confirm the visible wording on Home), `models.allowed_tiers: [small-local]`.

- [ ] **Step 1:** Unit test: start the server with test env, assert identity JSON, a mocked `/api/home` 200, an unmocked `/api/nope` 404, and both recorded in the state file; missing nonce env → process exits non-zero.
- [ ] **Step 2:** FAIL → implement → PASS (`cd web && pnpm build && pnpm test`).
- [ ] **Step 3:** Manual check: run uat-harness `npm run journey -- ../project-home` with `UAT_MODEL_SMALL_LOCAL_URL=scripted:<file>` replying `done` → report renders three goals.
- [ ] **Step 4:** Commit `feat(uat): loopback fixture, first-week deck and oracle`; push; draft PR in project-home.

### Task 13: First real run, one fix, second run (homelab)

Runs where a local vision model is reachable (spec D18). Needs a machine with the model and both checkouts;
from a cloud session this is done through a connected computer folder or handed to the owner as one command.

- [ ] **Step 1:** On the run machine set `UAT_FIXTURE_ORIGINS=http://127.0.0.1:<port>`, `UAT_FIXTURE_PORT=<port>`, `UAT_MODEL_SMALL_LOCAL_URL=<local OpenAI-compatible /v1 URL>`, `UAT_MODEL_SMALL_LOCAL_NAME=<smallest vision model>`; run `npm run journey -- <project-home> --trials 1`. Expected: exit 0, `report.md` with three verdicts and a coverage receipt. If `NOT VERIFIED (blind)`, record it and try the next-smallest vision model, labelled in the report — never silently.
- [ ] **Step 2:** From the report, pick one friction a normal assertion would miss (spec Phase 1 acceptance); quote it in the uat-harness PR.
- [ ] **Step 3:** Make one usability fix for it on a project-home branch (own small PR; product rules apply), rebuild `web/dist`, rerun the same command.
- [ ] **Step 4:** Add both `report.md` summaries to the uat-harness PR body (text only) with a one-paragraph before/after comparison. Raw evidence stays on the run machine.

---

## Self-review notes

- Spec coverage (Phase 1): fixture gate §10.1 → Tasks 2–4, 10; oracle-first verdicts §4.4 → 7; coverage receipt §4/§10.3 → 5, 9; privacy split §10.4 → 9, 10; one persona/Chromium/one model → 1, 5, 6; trials configurable default 1 → 1, 9; before/after proof → 13. Deferred by spec: lint, marks assist, calibration, cost accounting, draft issues, other personas, WebKit, helper commands, adoption.
- Spend gate is tier-only in Phase 1; `budget_usd_per_run` is parsed and reported, enforced from Phase 2 (cost accounting).
- `redactArtifacts` is a no-op without a token; journeys run token-free on synthetic fixtures, and raw evidence never leaves `private/`.
