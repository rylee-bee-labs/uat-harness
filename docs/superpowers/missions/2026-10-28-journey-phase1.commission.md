---
name: uat-harness · Journey mode Phase 1 (proof)
objective: A small local vision model, using only ordinary touch input, attempts three human goals on an authorized isolated Project Home fixture, leaves an honest redacted per-goal record, and shows an observable improvement after one real usability fix.
deadline: 2026-11-11T07:00
authority: Build, test and open PRs in uat-harness and project-home per the Phase 1 plan; run the journey on the run machine; never merge, deploy, spend or touch gates.
accept: cd uat-harness && npm ci && npm run check && npm test && cd ../project-home/web && pnpm install --frozen-lockfile && pnpm build && pnpm test
---
# Commission: journey mode Phase 1 — a small model tries real goals on Project Home

uat-harness is the estate's canonical UAT tool. Today it has one mode, **sweep** (`uat_driver.cjs`/`uat.py`):
real clicks and taps over every element plus axe. This mission adds the first slice of a second mode,
**journey**: a *player* model gets a plain-language *goal* from a *deck* in the product repo, sees only what its
*persona* may perceive (here: screenshots), acts only with ordinary input (here: touch taps, typing, scrolling),
and a *verifier* (a product-owned *oracle* first, a model *judge* as fallback) decides PASS / FAIL / UNKNOWN.
It runs only against an authorized isolated *fixture* (a loopback Project Home build with canned synthetic API
data) that the harness itself starts and identifies by a one-time nonce. The design is
`uat-harness/docs/superpowers/specs/2026-10-28-human-shaped-uat-design.md`; the task-by-task plan is
`uat-harness/docs/superpowers/plans/2026-10-28-journey-phase1.md`. Read both before dispatching anything.

## Why
Prove, cheaply and honestly, that a small local model driving the product like a person finds usability problems
that green tests miss (Project Home PR #279, #252), before anything bigger is built on the idea.

## Decisions in force (quote, do not paraphrase)

- 2026-10-28 Rylee (spec approval): "That was it. I approve"
- 2026-10-28 Rylee (design audit, PR #42): "Acceptance for the first implementation: An unfamiliar local model takes ordinary input, attempts three human goals, produces a redacted, revision-stamped transcript with outcome-level PASS/FAIL/UNKNOWN, and reveals at least one problem that a normal assertion missed. After one usability fix, a fresh trial shows an observable improvement. No broad workflow/engine, new governance gate or retirement of existing tools until this works."
- 2026-10-28 Rylee (design audit, PR #42): "A self-declared disposable target isn't an authorization boundary"
- 2026-10-28 Rylee (design audit, PR #42): "Judge agreement isn't proof of the stated outcome"
- 2026-10-28 Rylee (design audit, PR #42): "Start with one approved disposable Project Home fixture, one local vision model, one Chromium body, three goals, one independent outcome check, and a before/after report from a real usability fix."
- 2026-10-28 Rylee (brainstorm): runs execute "Homelab first"; the persona's model is "Persona chooses"; spend is "Based on per project settings via a variable maybe?"
- uat-harness AGENTS.md rule 4: "Findings are never pass/fail." Rule 7: "Public-safe tracked files." Both stand.

## Scope (in / out)

- In: uat-harness — new `uat_journey.cjs`, `lib/journey/`, `personas/`, `scripts/check-syntax.cjs`, additive changes to `lib/policy.cjs` and `lib/netpolicy.cjs`, new unit/browser tests, docs (AGENTS.md, README.md, docs/agent-reference.md, the spec's status line), `package.json` (`yaml` dependency, `check`/`journey` scripts).
- In: project-home — `scripts/uat-target`, `uat/` (fixture data, settings, one deck, one oracle), one unit test wired into `pnpm test`; and, in Phase 4 only, one small usability fix chosen from the run's evidence, as its own PR.
- Out: the sweep driver's behaviour and the E01/E02/E03 guarantees (must stay green unchanged); WebKit; any second persona; `doctor/init/plan/explain/retest`; marks assist; calibration; draft-issue generation; adoption gates (mission templates, landing checks, CI jobs, Play-Nice); retiring or editing any other repo's UAT tooling; Project Home's backend, auth, deploy and CI workflow files; any real or deployed Project Home instance. A worker that reaches one of these stops and reports.

## Authority and gates

- Allowed: branches, commits, tests and draft PRs in uat-harness and project-home; installing declared dependencies; running the fixture and the journey on loopback on the run machine with a local model; quoting text-only report summaries in PR bodies.
- Rylee's alone: every merge; the project-home usability-fix PR (product change); any paid or non-local model tier; publishing any screenshot or raw evidence (spec §10.4 disclosure step) — `mission set T NEEDS_OWNER --reason authority --blocker "<the decision>" --option "<A>" --option "<B>" --recommend "<A>"`, and keep working on everything else.
- Merging is GitHub's: land with `bin/mission_land.py`; never `gh pr merge`, never deploy.
- Never weaken a safeguard to get a run through: no widening `UAT_FIXTURE_ORIGINS` beyond the one loopback fixture origin, no `UAT_READONLY=0` on sweep, no pointing the journey at anything but the fixture.

## Inputs that already exist

- `uat-harness` PR #42 (branch `docs/human-shaped-uat-spec`): the approved spec and the Phase 1 plan. Build on that branch; base the implementation PR on `main` once #42 has merged, stacked on #42 until then.
- `uat-harness/lib/policy.cjs`, `lib/netpolicy.cjs`: origin decisions and the CDP `Fetch` per-hop policing the fixture gate reuses (AGENTS.md rule 8).
- `uat-harness/lib/artifacts.cjs`, `lib/redact.cjs`: staging → redact → promote, fail closed.
- `project-home/tests/ui/whats_live_walk.js` (`serveDist`), `calm_home_walk.js`, `needs_you_walk.js`: the static server pattern and canned API data (canary values) the fixture server adapts.
- `agent-platform/docs/practice/2026-10-24-field-lessons.md` §3 ("Weak models are the best doc test"): why repeated small-model trials matter; Phase 1 runs 1 trial per goal by design.

## Phases

1. Harness core — plan Tasks 1–9 — ends when: `npm run check && npm run test:unit` pass in uat-harness with every new unit test from the plan present.
2. Harness proof in a browser + docs — plan Tasks 10–11 — ends when: `npm test` passes (E01/E02/E03 unchanged plus the new journey fixtures) and the draft PR is open. (deps: 1)
3. Project Home fixture — plan Task 12 — ends when: `pnpm build && pnpm test` pass in project-home/web and a scripted-model journey renders a three-goal report. (deps: 1; the identity contract in plan Task 4)
4. First real run, one fix, second run — plan Task 13 — on the run machine with a local vision model — ends when: two text-only report summaries and a before/after paragraph are in the uat-harness PR body, quoting at least one friction a normal assertion missed. (deps: 2, 3; the fix PR waits for Rylee)

## Per-unit work

| Unit | Topic | Task does | Returns |
|---|---|---|---|
| uat-harness | journey-phase1 | Plan Tasks 1–11, one commit per task, TDD as written | result · changed files/commits · checks run · evidence · unresolved · next · self-review |
| project-home | uat-fixture | Plan Task 12 | result · changed files/commits · checks run · evidence · unresolved · next · self-review |
| run machine | journey-phase1 | Plan Task 13 steps 1–2 and 4 (the runs and the evidence) | result · both report summaries (text) · model name and tier · coverage receipt · unresolved · next |
| project-home | ph-usability-fix | Plan Task 13 step 3: one small fix for the chosen friction, own PR | result · changed files/commits · checks run · evidence · unresolved · next · self-review |

Paste the Self-review requirement from `templates/return.md` into every worker brief. Each harness task gets a fresh
reviewer before the next starts (the plan's recommended subagent-driven method); Tasks 2–4 and 10 are the
security boundary and get the most careful review.

## Acceptance

- `cd uat-harness && npm run check && npm test` → exit 0; Playwright lists the E01, E02, E03 and new journey specs as passed.
- `cd project-home/web && pnpm build && pnpm test` → exit 0, including `uat_target_unit.js`.
- Journey run 1 on the fixture (`npm run journey -- ../project-home --trials 1`) → exit 0; `report.md` shows three goal rows each with a verdict and `verified_by`, a coverage receipt with physical device and screen reader as `UNKNOWN — not observed`; no `*.png` outside `<out>/private/`.
- Journey run 2 after the fix → exit 0; the PR body compares the two runs and names the friction that changed.
- A blind or unreachable model is reported as `NOT VERIFIED (blind)` / `NOT RUN (no model)`, never as a pass.

## Final output

- A uat-harness PR adding journey mode Phase 1, with two text report summaries and the before/after comparison in its body.
- A project-home PR adding the loopback fixture, deck, settings and oracle.
- A project-home PR with one usability fix, awaiting Rylee.

## Stop conditions

- The deadline passes.
- A decision in force is contradicted: stop and say which one is in the way.
- Work would cross the out-of-scope boundary.
- No local vision model on the run machine passes the sanity check: `mission set T BLOCKED --blocker "no local vision model passes the sanity check"` with the models tried; do not switch to a paid tier.
- A safeguard would have to be weakened for a run to work.
- Acceptance cannot be met with what is available: `mission set T BLOCKED --blocker "<what is missing>"`.
