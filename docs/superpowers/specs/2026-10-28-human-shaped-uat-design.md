# Human-shaped UAT — design

**Status:** Proposed (design agreed in conversation 2026-10-28; revised after owner review on PR #42 — isolation
boundary, outcome oracle, friction vs defect, coverage labels, privacy, and a smaller Phase 1).
Not approved for build. Nothing here authorizes spend, merge-gate changes, deploys or weaker safeguards.

**Supersedes the scope of:** [#41](https://github.com/rylee-bee-labs/uat-harness/issues/41) (newcomer UAT with a
small local model) and folds in [#13](https://github.com/rylee-bee-labs/uat-harness/issues/13) (domain player
drivers research).

## 1. Why

The estate's worst usability bugs passed every test:

- Project Home's More menu would not scroll on a phone, so Vault and Settings were unreachable; tests were green
  (Project Home PR #279).
- Memomancer's player was invisible on iPhone; Chromium emulation passed (Memomancer #59/#60).
- "I really can't decipher or act on data the way that makes sense" — the owner, on Project Home (ph-plain
  mission); "what is waiting on me, what is stuck, am I OK?" (Project Home #252).
- VEFR players "get lost: hints are ephemeral" (VEFR first independent pack research).
- A nightly playtester reported "0 bugs" on nights its review never ran; headless renders drew blank text;
  9 of 27 claimed fixes failed a second look. The observer can be wrong too.

Assertions check that things exist. They cannot check that a person can *use* them. Meanwhile about eight
overlapping UAT tools exist across the estate (agent-platform walkers, onboarding UAT and nightly playtester,
VEFR walkers and Agent Player Lab, Worlds' live walk, a workspace UAT guide). Each holds a good idea; together
they are drift.

### North star

> **If a small local model can't complete a goal using only a persona's senses and ordinary input, a tired
> human probably can't either.**

This is a design rule as much as a test: building for it (clear labels, visible outcomes, keyboard and
screen-reader parity, no dead ends) makes products better for people. A model's stumble is evidence for a person
to weigh, not by itself a verdict on the product (§4, step 5). It is proposed as a clause in Play-Nice
`contracts/people/ACCESSIBILITY.md` (separate PR, owner approval), with uat-harness as the tool that proves it.

## 2. Decisions in force

| # | Decision |
|---|---|
| D1 | Scope: testing products **as a user** across web, games (browser first), later desktop apps. Operator-style desktop troubleshooting is a later, separate risk class. |
| D2 | **Senses are a persona setting.** Every run records screenshots and the accessibility tree; the persona decides which the player may use. |
| D3 | Runs are **on demand first** (an agent finishing UI work, or a human); scheduled sweeps later reuse the same command. |
| D4 | uat-harness is the **single canonical home** for the core. |
| D5 | Journey decks live in **each product repo** (`uat/`); uat-harness owns the format and runner. |
| D6 | First vertical slice: **Project Home**, against its existing mocked build (built `web/dist` + mocked `/api`, canary data). |
| D7 | **Persona chooses the model tier**; default novice tier is the smallest local vision model. A stronger reviewer may diagnose but never overwrites novice evidence. |
| D8 | Hands are **raw ordinary input** (click x,y, type, key, scroll, drag, tap). An optional numbered-marks overlay may help small models point; runs that use it are labelled *assisted*. |
| D9 | Verdicts come from the **strongest available verifier**: a product-owned outcome **oracle** (hidden from the player) where one exists, else a model judge against the goal's outcome line. FAIL when evidence contradicts the outcome; UNKNOWN only when evidence is insufficient or conflicting. Every verdict records what verified it. Player/verifier disagreement is a finding. |
| D10 | **Journeys run only against an authorized isolated fixture** (§10.1). Authorization is machine-local and bound to the actually navigated origin; a product's own settings cannot grant it. Anything else refuses. |
| D11 | **Fresh trials per goal** (target 3; Phase 1 may run 1). Matching symptoms in 2+ trials are **reproducible agent friction**; a **confirmed product defect** needs independent corroboration or a fix-and-retest. |
| D12 | Report: **one-page `report.md`** first, full evidence linked. |
| D13 | Engines: **Chromium first; WebKit earned after Phase 1.** Both are *simulation* (§10.3): neither is a physical device, and real-device coverage stays UNKNOWN until observed. |
| D14 | Surfaces plug in through one **body** interface; browser body in v1. |
| D15 | Overlapping tools: **absorb their best ideas, then retire** them to pointers one at a time after v1 proves itself. |
| D16 | Persona set: phone first-timer, keyboard-only, a11y-tree-only (approximates a screen-reader user; not real AT), tired returner. Phase 1 ships one. |
| D17 | Each goal attempt is bounded by a **step and time cap**; "stuck" is its own finding. |
| D18 | Runs execute **homelab first** (where the local model is reachable); cloud agents may trigger or run cloud-tier personas only. |
| D19 | Reproducible friction and confirmed defects get a **draft issue**, labelled with which they are, for owner approval; nothing auto-files. |
| D20 | **Spend policy is per product** (`uat/settings.yaml`), overridable per run by env; unset means local models only. |

## 3. Shape

```
 product repo                  uat-harness (canonical)
 ─────────────                 ─────────────────────────────────────────
 uat/decks/*.md   ──goals──▶   Player loop: observe → decide → act → observe
 uat/settings     ──policy─▶        │ senses/hands/patience from ▼
                               Persona
                                    │ acts through ▼
                               Body: see · act · reset · identity
                                 v1: Browser (Chromium; WebKit earned later)
                                 later: Desktop (e.g. noVNC into a VM)
                                    │ everything recorded by ▼
                               Witness → Verifier → report.md (+ draft issues)
```

| Unit | Does | Depends on |
|---|---|---|
| **Deck** | Plain-language goals + judge-only outcome lines | nothing (Markdown) |
| **Settings** | Target, how to start the fixture, fixture id, allowed model tiers, budget | nothing (YAML) |
| **Persona** | Senses, hands, engine, viewport, model tier, patience, trials, character | nothing (Markdown + front matter) |
| **Body** | `see()` → screenshot + a11y tree; `act(action)` → real input; `reset()`; `identity()` (engine, viewport, build) | Playwright (browser body) |
| **Player** | Picks one action from what the persona may perceive | a model client |
| **Witness** | Records each step (perception, action, timing, tokens, cost); stages, redacts, promotes — fail closed | `lib/redact.cjs`, `lib/artifacts.cjs` |
| **Verifier** | PASS / FAIL / UNKNOWN from a product-owned oracle, else a model judge against the outcome line; records `verified_by` | product oracle; a model client |
| **Fixture gate** | Proves the target is an authorized isolated fixture and keeps every hop on it (§10.1) | `lib/netpolicy.cjs`, machine-local env |
| **Model client** | One OpenAI-compatible chat call; tier → endpoint from machine-local env | env only |

**Two modes share the body, witness and safety rails:**

- **sweep** — today's driver (axe, tap targets, dead clicks). Its load-bearing rules stay: fresh
  `scrollIntoViewIfNeeded()` + `boundingBox()` before each input, `goto` not `goBack` for its return-to-page,
  re-inventory every pass, CDP `Fetch` auth policing.
- **journey** — the new player loop. It navigates freely (no forced return-to-page), but acts through the same
  real-input body and the same network policy, bound to an authorized fixture (§10.1).

## 4. A run, end to end

Command: `uat journey <product-dir> [--deck NAME] [--persona NAME]`.

1. **Preflight (refusals, not warnings).**
   Load deck, settings, persona; malformed → stop with a plain message and `→ next:`.
   Fixture gate (§10.1): the target origin, including any `UAT_TARGET` override, must be on the machine-local
   authorized fixture list and answer the fixture identity check; otherwise the whole run is **NOT RUN (unauthorized
   target)**.
   Spend gate: persona tier not allowed by settings/env → **NOT RUN (tier not allowed)**.
   Model unreachable → **NOT RUN (no model)**; never a silent substitute.
2. **Sanity and calibration.** Eyes: screenshot the start page and ask the player model to name one known visible
   thing; blank render or no vision → **NOT VERIFIED (blind)**. Tree-only personas check the tree is non-empty
   instead. Hands: one harmless input must produce an observable change. Calibration (Phase 2): the same model and
   persona first attempt a known-easy goal on the demo product; failing it means the model, not the product, is the
   limit, and the run says so instead of reporting product friction.
3. **Loop, per goal × trials.** Fresh browser context and `reset()` per trial. The player sees only the goal
   paragraph, the persona character, what its senses allow, and its own short notes — never the outcome line,
   selectors, or other goals. One ordinary action per step. Stops on "done", "give up", the step/time cap, or
   **stuck** (N actions with no visible change; recorded as friction).
4. **Verify.** In order of strength:
   - **Oracle** — a product-owned check named by the goal (its `Oracle:` line), run by the harness after the
     trial against fixture state (e.g. the mocked API's recorded state). Hidden from the player. Decides PASS/FAIL.
   - **Judge** — a separate model call with the final evidence and the outcome line, used when no oracle exists.
     PASS only when evidence shows the outcome; FAIL when evidence contradicts it (including a player "done" over a
     screen that plainly isn't the outcome); UNKNOWN when evidence is insufficient or conflicting.
   - **Human** — an owner annotation, which adds to the record and never overwrites it.
   Each verdict records `verified_by` (oracle / judge / human) and the evidence it used. Player/verifier
   disagreement is always a finding. Friction (retries, backtracks, "where is…", misclicks) is kept even on PASS.
5. **Aggregate.** Per goal, show all trial verdicts (e.g. `PASS PASS FAIL`); never collapse. Group friction by
   **matching symptom** (same goal, same place, same kind of trouble) and tag a likely cause: *product*,
   *model/vision*, *actuation* (input didn't land), or *harness*.
   - Seen in one trial → **observed once**.
   - Matching symptom in 2+ trials → **reproducible agent friction** → draft issue labelled as such.
   - **Confirmed product defect** only with independent corroboration (owner or stronger-reviewer annotation,
     a deterministic check, or another persona/model hitting it) **or** a fix whose fresh retest removes it.
6. **Finalize.** Stage → redact → split private from shareable (§10.4) → promote, fail closed. Exit non-zero
   **only** when the target is unreachable or the run cannot start (including a refused fixture gate). Findings never set the exit code.

**Statuses** (first-class, never implied): PASS, FAIL, UNKNOWN, NOT RUN (reason), NOT VERIFIED (reason).

**Coverage receipt.** Every report states, per run: engine and version, viewport, whether the device was
*simulated* or *physical*, whether input was *a11y-tree-driven* or real assistive technology, the marks assist,
model and tier, and fixture identity. Anything not actually observed (physical iPhone, VoiceOver/NVDA/JAWS) is
listed as **UNKNOWN — not observed**, never implied by a simulation.

## 5. Files

### Deck — `uat/decks/<name>.md` (product-owned)

```md
---
personas: [phone-first-timer, tired-returner]
writes: false
covers: [web/src/home/**, web/src/nav/**]
---
# First week with Project Home

## G1 · See what needs me
You just opened Project Home on your phone between meetings.
Find out whether anything is waiting for you to decide.
**You'll know it worked when:** you can say how many items wait on you, or that none do.
**Oracle:** waiting-count
```

`uat deck lint` **rejects** selectors, CSS/ids, URLs beyond the start page, and goals without an outcome line;
**warns** on route spoilers ("tap the More menu"). `covers` maps changed paths to decks for `uat plan`.
`writes:` declares intent for planning and reporting only; it is **not** a safety control (the fixture boundary
in §10.1 is). The outcome line and oracle name are stripped before anything reaches the player.

**Oracles** live in the product repo (`uat/oracles/<name>`): a small executable the harness runs after a trial.
It reads fixture state (never the player's transcript) and prints `pass`, `fail` or `unknown` with a one-line
reason. For Project Home's mocked build, it inspects the mock's recorded state and the canary data it served.

### Persona — `personas/<name>.md` (uat-harness-owned)

```md
---
senses: [screenshot]          # screenshot | a11y-tree
hands: [touch]                # mouse | keyboard | touch
engine: chromium              # webkit once earned; both are simulated mobile
viewport: 390x844             # device emulation, not a physical phone
model_tier: small-local
patience: { steps: 30, minutes: 5, stuck_after: 5 }
trials: 3
assist: marks-allowed
---
You've never used this app. You're on your phone, one-handed, a bit rushed.
You don't read long text. If something doesn't respond, you try once more, then look elsewhere.
```

Persona set: `phone-first-timer` (above; Phase 1's only persona); `keyboard-only` (desktop, screenshot,
keyboard); `a11y-tree-only` (accessibility tree only, keyboard — approximates a screen-reader user; it is **not**
VoiceOver/NVDA/JAWS, and its receipt says so); `tired-returner` (screenshot, mouse, short patience — tests
glanceability).

### Settings — `uat/settings.yaml` (product-owned)

```yaml
target: http://127.0.0.1:PORT/          # real port from env
start: scripts/uat-target               # brings up a fresh fixture on synthetic data
fixture_id: project-home-mocked         # must match what the fixture itself reports (§10.1)
models:
  allowed_tiers: [small-local]          # unset → small-local only
  budget_usd_per_run: 0
```

Env overrides: `UAT_TARGET`, `UAT_MODEL_TIERS`, `UAT_BUDGET_USD`. An overridden target is held to exactly the
same fixture gate; an override can never widen what is authorized. Tier endpoints are machine-local env
(`UAT_MODEL_<TIER>_URL`, `UAT_MODEL_<TIER>_NAME`), never committed.

### Output — `runs/<deck>-<timestamp>/` (gitignored)

```
report.md            shareable: per-goal verdicts + verified_by, friction groups, coverage receipt, cost
summary.json         shareable machine header: run id, build SHA, fixture id, deck/persona hashes, model, verdicts
drafts/issue-*.md    reproducible friction / confirmed defects, labelled, for owner approval
private/goals/G1/trial-1/steps.jsonl, step-NN.png, tree-NN.txt, prompts/   raw evidence; stays on the machine
```

Shareable files are text summaries; a screenshot is copied into the shareable set only through the disclosure
step in §10.4.

## 6. Using it without guessing

The tool always says the next step.

| Command | When | Returns |
|---|---|---|
| `uat` | "What is this?" | Short menu + the command to run first |
| `uat doctor` | First run on a machine; anything odd | Deps, Chromium + WebKit, each tier's endpoint, vision sanity; every ✗ with its exact fix |
| `uat init <product>` | Product has no `uat/` | Settings + starter deck drafted from README and open UX issues + `AGENTS.md` "Done means" snippet; lints |
| `uat plan <product> [--changed PATHS]` | "What should I run?" | Decks × personas, est. time/cost, copy-paste commands |
| `uat journey …` | Human-shaped test | Run folder + report |
| `uat sweep <url>` | Engineering checks | Today's driver output |
| `uat explain <run>` | "What do I do with this?" | Confirmed findings, drafts awaiting approval, next command |
| `uat retest <finding>` | After a fix | Fresh trials of the affected goals, compared with the original friction |

Every command supports `--json`; every error ends `→ next: <command>`; exit codes are a published table.
`uat.py URL` keeps working as an alias for `uat sweep`.

**Agent skill.** `skills/uat/SKILL.md` in uat-harness: the north star, the decision table (UI changed → `plan`;
claimed fix → `retest`; new product → `init`; unclear result → `explain`), the status vocabulary, and three
nevers: never edit a deck to make a goal pass; never present NOT RUN as a pass; never let a reviewer overwrite
novice evidence. Other repos point at it; none copy it.

**People onboarding.** A five-minute README quickstart against a bundled `examples/demo-product/` with one
planted friction (a hidden Settings link), so the first run shows a real, reproducible finding and its draft issue.

**Dogfood.** uat-harness's own README goes through the small-model onboarding UAT. If a small model can't get
from `doctor` to a finished `journey` from the README alone, the README is wrong.

## 7. Adoption and enforcement

Gate on **"did UAT run, and is the evidence honest?"** — never on whether goals passed.

| Layer | Where | Effect | Approval |
|---|---|---|---|
| Ask | Mission commission template, Acceptance section | "UI-touching unit → follow the uat skill; attach report; NOT RUN states why" | docs |
| Rule | Product `AGENTS.md` "Done means" (written by `uat init`) + Play-Nice clause | Spreads via existing adoption manifests | Play-Nice PR: owner |
| Record | Mission landing step (agent-platform) | Refuses to open a PR for a UI change in a product with `uat/` unless the body has a UAT evidence block (summary + verdicts, or `UAT: NOT RUN — reason`) | owner (private repo) |
| Check | `uat-evidence` job in the ci-harness reusable workflow | Same presence check for non-mission PRs. **Advisory** first; required only by owner decision | required = merge gate: owner |

Honesty checks: the evidence block's `summary.json` build SHA must match the PR head; the decks run must cover
what `uat plan` named for the changed paths. A PR that claims to fix a `uat-finding` issue needs a fresh
`uat retest` showing the friction gone, or it is labelled *claimed, not verified*.

## 8. Phases

Each phase is **earned**: it starts only after the previous phase's acceptance has been shown and the owner
approves. Nothing after Phase 1 is a prerequisite for Phase 1.

| Phase | Delivers | Proves |
|---|---|---|
| **1 — proof** | One Chromium body; one local vision model (endpoint by env); one persona (`phone-first-timer`, simulated mobile); the fixture gate (§10.1) with Project Home's mocked build as the one authorized fixture; one deck of 3 goals with at least one oracle; trials configurable, default 1; `report.md` with `verified_by` and coverage receipt; private/shareable split; `uat journey` only | See acceptance below |
| **2 — trust** | Repeated trials, symptom grouping and the friction tiers; calibration; judge fallback hardening; NOT VERIFIED paths; deck lint; marks assist; cost accounting; draft issues; `keyboard-only` and `a11y-tree-only` personas | Findings are repeatable and honestly classified |
| **3 — breadth** | WebKit body (unauthenticated only); more decks and products; first browser-game deck | Coverage widens without weakening honesty |
| **4 — use without guessing** | `doctor`, `init`, `plan` (`covers`), `explain`, `retest`; skill; demo product; quickstart; dogfood run | Agents and people use it correctly unprompted |
| **5 — adoption** | Commission template line, `AGENTS.md` snippet, landing-step evidence check, advisory CI job; Play-Nice clause PR — each an owner decision | Missions follow it |
| **6 — retire drift** | One follow-up per overlapping tool: lift what's useful, replace with a pointer | One UAT home |
| Later | Scheduled sweeps; desktop body (VM + noVNC); WebKit auth policing; real-device and real-AT runs; game decks via product drivers (VEFR Player Driver capsules); operator mode as its own design | — |

**Phase 1 acceptance.** An unfamiliar local model, using ordinary input only, attempts three human goals on the
authorized Project Home fixture and produces a redacted, revision-stamped transcript with outcome-level
PASS/FAIL/UNKNOWN and what verified each. The run reveals at least one problem a normal assertion missed. After
one real usability fix on a Project Home branch, a fresh run shows an observable improvement, compared by hand
(Phase 4's `retest` automates this). No broad workflow or engine, new governance gate, or retirement of existing
tools until this works.

## 9. Testing

- Unit (browser-free): deck/persona/settings parsing; outcome-line and oracle stripping before the player sees
  anything; fixture-gate decisions (authorized list, override, nonce mismatch); verdict rules (oracle beats judge;
  FAIL vs UNKNOWN); status mapping; `summary.json` schema; tier → endpoint resolution from env.
- Model client tested against a **scripted fake model** (canned actions), so CI never needs a real model.
- Browser fixtures:
  - a scripted player completing a goal → oracle PASS; a scripted "lying" player claiming done on the wrong
    screen → oracle FAIL; no oracle and ambiguous evidence → UNKNOWN;
  - an off-origin redirect, an off-origin popup and a `UAT_TARGET` override to an unlisted origin are each
    refused and recorded;
  - a blank page yields NOT VERIFIED (blind);
  - shareable output contains no screenshots or raw trees.
- Existing E01/E02/E03 credential and redaction fixtures keep passing unchanged.
- Smoke: a real small-model run against the Project Home fixture on the homelab, report quoted in the PR.

## 10. Safety

### 10.1 The fixture boundary

Journeys explore: the player chooses its own actions, and a GET can have side effects. So deck labels such as
`writes:` are never a safety control. **A journey runs only against an authorized isolated fixture**, and that is
checked against what the browser actually reaches:

1. **Authorization is machine-local.** The run machine's operator lists authorized fixture origins in env
   (`UAT_FIXTURE_ORIGINS`, exact scheme://host:port). A product's `uat/settings.yaml` and a `UAT_TARGET`
   override can only *name* a target; neither can authorize one.
2. **Identity is proven per run.** The harness starts the fixture itself (`start`, fresh synthetic data) and passes
   it a one-time nonce. The fixture must report its `fixture_id` and that nonce from a well-known path on the same
   origin. Wrong id, missing nonce, or a target the harness didn't start → **NOT RUN (unauthorized target)**.
3. **It binds to every hop.** The existing CDP `Fetch` policy re-checks each request and redirect hop against the
   fixture origin. Off-origin main-frame navigations are blocked; new pages and popups get the policy attached
   before their first navigation and are closed if off-origin; WebSockets are allowed only to the fixture origin;
   service workers stay blocked. Each refusal is recorded as a finding, and a trial that can't continue is
   **NOT RUN (left fixture)** with its evidence kept.
4. **Writes need all of the above.** Non-GET requests stay blocked by default and are allowed only on a verified
   fixture. Each trial starts from a reset fixture.

The network guard is necessary but does not certify that a server is read-only; that is why journeys never run
against live targets at all. Today's `sweep` mode and its read-only default are unchanged.

### 10.2 Credentials

Fixture runs use synthetic accounts and no `UAT_TOKEN` by default. When a token is set, origin scoping, per-hop
policing and fail-closed redaction are unchanged. CDP policing is Chromium-only, so WebKit runs refuse any token.

### 10.3 Simulation is labelled as simulation

Device emulation at a phone viewport is simulated mobile, not a physical phone. An a11y-tree-driven keyboard
persona approximates, but is not, a VoiceOver/NVDA/JAWS session. The coverage receipt (§4) names exactly what was
simulated, and physical-device or real-AT behaviour stays **UNKNOWN — not observed** until a real session has run.

### 10.4 Evidence privacy

Screenshots, accessibility trees, prompts and transcripts can carry user data that token scrubbing can't catch.

- Fixtures use **synthetic data**, which the fixture gate makes the default.
- Raw evidence lives under `private/`, stays on the run machine, and is never uploaded or attached by the
  harness, missions or CI.
- The shareable set (`report.md`, `summary.json`, drafts) is text summaries. A screenshot joins it only through an
  explicit human disclosure step that records who reviewed it and when; agents can't perform that step.
- Any publish or upload path fails closed if it would include `private/` or unreviewed images.
- Sending a screenshot to a model is itself a disclosure: non-local model tiers are allowed only on synthetic
  fixtures and only when the product's settings allow that tier.
- Token redaction still runs over everything, private and shareable.

### 10.5 Repo hygiene

Public repo: no hostnames, ports, LAN IPs, machine paths or secrets in tracked files.

## 11. Out of scope

Operator/troubleshooting mode; native desktop body; real-device farms; scheduling; a UI or MCP server; any
pass/fail threshold on findings; automatic issue filing; copying VEFR's game engine or action tape into this repo.

## 12. Open questions

- Whether the novice tier's smallest local vision model is good enough at 390×844 screenshots — Phase 1's vision
  sanity check answers this; fall back to a labelled `assisted` run, not a bigger model silently.
- The location of the owner's original "usable by a local LLM with visual and keyboard/mouse input" note was not
  found in repos; if it turns up, cite it next to the north star.
