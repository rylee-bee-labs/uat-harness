# Human-shaped UAT — design

**Status:** Proposed (design agreed in conversation 2026-10-28; this written spec awaits owner review).
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
screen-reader parity, no dead ends) makes products better for people. It is proposed as a clause in Play-Nice
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
| D9 | Verdicts: each goal has an **observable outcome line** the player never sees; a separate judge decides; player/judge disagreement = UNKNOWN. |
| D10 | **Read-only by default.** Write goals run only against a target declared `disposable: true`; otherwise NOT RUN. |
| D11 | **3 fresh trials per goal**; friction seen in 2+ is confirmed, once is a maybe. |
| D12 | Report: **one-page `report.md`** first, full evidence linked. |
| D13 | Engines: **Chromium and WebKit**. Phone personas use WebKit. |
| D14 | Surfaces plug in through one **body** interface; browser body in v1. |
| D15 | Overlapping tools: **absorb their best ideas, then retire** them to pointers one at a time after v1 proves itself. |
| D16 | Starter personas: phone first-timer, keyboard-only, screen-reader user, tired returner. |
| D17 | Each goal attempt is bounded by a **step and time cap**; "stuck" is its own finding. |
| D18 | Runs execute **homelab first** (where the local model is reachable); cloud agents may trigger or run cloud-tier personas only. |
| D19 | Confirmed findings get a **draft issue** for owner approval; nothing auto-files. |
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
                                 v1: Browser (Chromium + WebKit)
                                 later: Desktop (e.g. noVNC into a VM)
                                    │ everything recorded by ▼
                               Witness → Judge → report.md (+ draft issues)
```

| Unit | Does | Depends on |
|---|---|---|
| **Deck** | Plain-language goals + judge-only outcome lines | nothing (Markdown) |
| **Settings** | Target, how to start it, disposable flag, allowed model tiers, budget | nothing (YAML) |
| **Persona** | Senses, hands, engine, viewport, model tier, patience, trials, character | nothing (Markdown + front matter) |
| **Body** | `see()` → screenshot + a11y tree; `act(action)` → real input; `reset()`; `identity()` (engine, viewport, build) | Playwright (browser body) |
| **Player** | Picks one action from what the persona may perceive | a model client |
| **Witness** | Records each step (perception, action, timing, tokens, cost); stages, redacts, promotes — fail closed | `lib/redact.cjs`, `lib/artifacts.cjs` |
| **Judge** | PASS / FAIL / UNKNOWN from final evidence vs the outcome line | a model client |
| **Model client** | One OpenAI-compatible chat call; tier → endpoint from machine-local env | env only |

**Two modes share the body, witness and safety rails:**

- **sweep** — today's driver (axe, tap targets, dead clicks). Its load-bearing rules stay: fresh
  `scrollIntoViewIfNeeded()` + `boundingBox()` before each input, `goto` not `goBack` for its return-to-page,
  re-inventory every pass, CDP `Fetch` auth policing.
- **journey** — the new player loop. It navigates freely (no forced return-to-page), but acts through the same
  real-input body and the same network policy.

## 4. A run, end to end

Command: `uat journey <product-dir> [--deck NAME] [--persona NAME]`.

1. **Preflight (refusals, not warnings).**
   Load deck, settings, persona; malformed → stop with a plain message and `→ next:`.
   Write gate: a `writes: true` deck against a non-disposable target → those goals **NOT RUN (unsafe target)**.
   Spend gate: persona tier not allowed by settings/env → **NOT RUN (tier not allowed)**.
   Model unreachable → **NOT RUN (no model)**; never a silent substitute.
2. **Sanity.** Eyes: screenshot the start page and ask the player model to name one known visible thing; blank
   render or no vision → **NOT VERIFIED (blind)**. Text-only personas (screen-reader) check the tree is non-empty
   instead. Hands: one harmless input must produce an observable change.
3. **Loop, per goal × trials.** Fresh browser context and `reset()` per trial. The player sees only the goal
   paragraph, the persona character, what its senses allow, and its own short notes — never the outcome line,
   selectors, or other goals. One ordinary action per step. Stops on "done", "give up", the step/time cap, or
   **stuck** (N actions with no visible change; recorded as friction).
4. **Judge.** Separate call; sees final evidence + outcome line. Player "done" + judge disagrees → **UNKNOWN**,
   and the disagreement is a finding. Friction (retries, backtracks, "where is…", misclicks) is kept even on PASS.
5. **Aggregate.** Per goal, show all trial verdicts (e.g. `PASS PASS FAIL`); never collapse. Friction in 2+
   trials → confirmed → draft issue. Once → maybe.
6. **Finalize.** Stage → redact → promote, fail closed. Exit non-zero **only** when the target is unreachable or
   the run cannot start. Findings never set the exit code.

**Statuses** (first-class, never implied): PASS, FAIL, UNKNOWN, NOT RUN (reason), NOT VERIFIED (reason).

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
```

`uat deck lint` **rejects** selectors, CSS/ids, URLs beyond the start page, and goals without an outcome line;
**warns** on route spoilers ("tap the More menu"). `covers` maps changed paths to decks for `uat plan`.

### Persona — `personas/<name>.md` (uat-harness-owned)

```md
---
senses: [screenshot]          # screenshot | a11y-tree
hands: [touch]                # mouse | keyboard | touch
engine: webkit
viewport: 390x844
model_tier: small-local
patience: { steps: 30, minutes: 5, stuck_after: 5 }
trials: 3
assist: marks-allowed
---
You've never used this app. You're on your phone, one-handed, a bit rushed.
You don't read long text. If something doesn't respond, you try once more, then look elsewhere.
```

Starter set: `phone-first-timer` (above); `keyboard-only` (desktop Chromium, screenshot, keyboard);
`screen-reader` (a11y-tree only, keyboard); `tired-returner` (screenshot, mouse, short patience — tests
glanceability).

### Settings — `uat/settings.yaml` (product-owned)

```yaml
target: http://127.0.0.1:PORT/          # real port from env
start: scripts/uat-target               # brings up the disposable target
disposable: true
models:
  allowed_tiers: [small-local]          # unset → small-local only
  budget_usd_per_run: 0
```

Env overrides: `UAT_TARGET`, `UAT_MODEL_TIERS`, `UAT_BUDGET_USD`. Tier endpoints are machine-local env
(`UAT_MODEL_<TIER>_URL`, `UAT_MODEL_<TIER>_NAME`), never committed.

### Output — `runs/<deck>-<timestamp>/` (gitignored)

```
report.md        one page: per-goal verdicts, top friction with a screenshot each, identity, cost
summary.json     machine header: run id, build SHA, deck/persona content hashes, model, verdicts, cost
goals/G1/trial-1/steps.jsonl, step-NN.png, tree-NN.txt
drafts/issue-*.md   confirmed findings, for owner approval
```

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
planted friction (a hidden Settings link), so the first run shows a real confirmed finding and draft issue.

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

| Phase | Delivers | Proves |
|---|---|---|
| **1 — vertical slice** | Browser body (Chromium + WebKit), model client, player loop, judge, witness reuse, `phone-first-timer` + `tired-returner`, one Project Home deck (3 goals from #252/#279) against the mocked build, `report.md` + `summary.json`, `doctor`, `journey` | A small local model attempts real goals with ordinary input and an honest per-goal record |
| **2 — trust** | 3 trials + aggregation, sanity checks, NOT RUN/NOT VERIFIED paths, deck lint, `keyboard-only` + `screen-reader`, marks assist, cost accounting, draft issues | Findings are repeatable and honest |
| **3 — use without guessing** | `init`, `plan` (`covers`), `explain`, `retest`, skill, demo product, quickstart, dogfood run | Agents and people use it correctly unprompted |
| **4 — adoption** | Commission template line, `AGENTS.md` snippet, landing-step evidence check, advisory CI job; Play-Nice clause PR | Missions follow it |
| **5 — retire drift** | One follow-up per overlapping tool: lift what's useful, replace with a pointer | One UAT home |
| Later | Scheduled sweeps; desktop body (VM + noVNC); WebKit auth policing; game decks (Cottage, Memomancer, VEFR via its own Player Driver capsules); operator mode as its own design | — |

Phase 1 is a usable first PR; each later phase is its own PR(s). Phase 1's evidence includes a before/after
pair: one run, a deliberate usability fix on a Project Home branch, a second run, and the two reports compared
by hand (Phase 3's `retest` automates this).

## 9. Testing

- Unit (browser-free): deck/persona/settings parsing and lint; preflight gates; aggregation (2-of-3); status
  mapping; `summary.json` schema; tier → endpoint resolution from env.
- Model client tested against a **scripted fake model** (canned actions), so CI never needs a real model.
- Browser fixtures: the demo product with its planted friction; the scripted player must find it, and a scripted
  "lying" player (claims done) must yield UNKNOWN. Blank-page fixture must yield NOT VERIFIED (blind).
- Existing E01/E02/E03 credential and redaction fixtures keep passing unchanged.
- Smoke: a real small-model run against the demo product on the homelab, report quoted in the PR.

## 10. Safety

- Read-only default and write gate (D10); never point journeys at live mutating endpoints.
- `UAT_TOKEN` origin scoping, CDP per-hop policing and fail-closed redaction are unchanged. CDP policing is
  Chromium-only: **WebKit runs are unauthenticated** until an equivalent guard exists; authenticated WebKit runs
  refuse.
- Model observations go to the endpoint named by env only. Redaction applies to recorded model prompts and
  replies as well as traces.
- Public repo: no hostnames, ports, LAN IPs, machine paths or secrets in tracked files.

## 11. Out of scope

Operator/troubleshooting mode; native desktop body; real-device farms; scheduling; a UI or MCP server; any
pass/fail threshold on findings; automatic issue filing; copying VEFR's game engine or action tape into this repo.

## 12. Open questions

- Whether the novice tier's smallest local vision model is good enough at 390×844 screenshots — Phase 1's vision
  sanity check answers this; fall back to a labelled `assisted` run, not a bigger model silently.
- The location of the owner's original "usable by a local LLM with visual and keyboard/mouse input" note was not
  found in repos; if it turns up, cite it next to the north star.
