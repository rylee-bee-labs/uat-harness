# Domain drivers and replayable UAT evidence

Status: research for [#5](https://github.com/rylee-bee-labs/uat-harness/issues/5)  
Date: 2026-10-06  
Origin: Rylee and Sol worked this through together while designing VEFR's Player Driver / Pass-the-Controller work.

## Question

If an application has a domain-specific player/driver contract, how should uat-harness use it without becoming a framework for that application's semantics?

VEFR is the first concrete case:

- a real game session can be captured as a portable state capsule;
- player actions can be recorded as a logical tape;
- a human, deterministic bot or model can drive legal actions;
- the same run should still be observable through a real browser with screenshots, video, trace, console/network evidence and axe.

## Recommendation

**Do not add a generic domain-driver runtime API to uat-harness yet.**

Slice 1 can work with the boundaries that already exist:

1. the application repo owns the domain driver and its semantics;
2. the application repo owns the UAT command that exercises that driver;
3. uat-harness remains the browser-real evidence collector;
4. application-specific artifacts are written under the configured UAT output directory;
5. `ci-harness` already uploads that directory as one artifact bundle.

Only add a reusable adapter after a second non-VEFR consumer proves the same integration shape is needed.

This follows the repo rule: do not turn one consumer's mechanism into another hidden framework.

## Existing uat-harness contract

uat-harness already owns:

- Chromium;
- real mouse/touch/typing;
- desktop/mobile passes;
- Playwright trace and video;
- screenshots;
- console/network findings;
- axe-core;
- token redaction and redact-before-promote artifact finalization;
- read-only network posture.

It explicitly does **not** own each consumer repo's dedicated suite.

That means a VEFR game runner should not be implemented here.

## External patterns

### Playwright trace is evidence around a run

Playwright Trace Viewer records actions, before/action/after DOM snapshots, screenshots, logs and network details. It is designed for inspecting what happened when a test fails.

Source: https://playwright.dev/docs/trace-viewer  
Accessed 2026-10-06.

**Boundary lesson:** keep trace as browser evidence. A domain's portable replay format should not depend on Playwright internals.

### Playwright codegen records real browser behavior into a test

Playwright can watch a person interact with the page and generate repeatable test actions.

Source: https://playwright.dev/docs/codegen  
Accessed 2026-10-06.

**Boundary lesson:** promoting a real human path into reusable QA is an established workflow. The domain may produce a more semantic recording than browser selectors.

### Chrome Recorder makes exported/replayed flows bug-report artifacts

Chrome DevTools Recorder can export/import/replay a user flow, step through it, and describes shared flows as useful for reproducing bugs.

Source: https://developer.chrome.com/docs/devtools/recorder/reference/  
Accessed 2026-10-06.

**Boundary lesson:** a portable flow next to screenshots/traces is useful evidence, but the application should own the vocabulary of the flow.

### Unity separates logical actions from physical input

Unity's Input System documents logical `InputAction`s independently of physical controls, and its input traces can be persisted and replayed.

Sources:

- https://docs.unity3d.com/Packages/com.unity.inputsystem@1.4/api/UnityEngine.InputSystem.InputAction.html
- https://docs.unity3d.com/Packages/com.unity.inputsystem@1.4/api/UnityEngine.InputSystem.LowLevel.InputEventTrace.ReplayController.html

Accessed 2026-10-06.

**Boundary lesson:** UAT may care whether a keyboard key or touch target really worked, while the application can keep a stable logical action underneath.

## Two layers of replay

For domain applications such as a game, separate:

### Semantic replay

The consumer repo submits domain actions directly through its own stable driver.

Example:

```text
move north
interact
equip ring
```

This proves the application/domain behavior and is portable across input devices.

### Fidelity replay

The consumer's UAT command uses a real browser to press/tap the physical control that should produce the same logical action.

This proves the outer binding/surface as well.

uat-harness should support the evidence around fidelity replay, but should not learn what `move north` means.

## Artifact layout

The configured UAT output directory may contain the normal files plus domain-owned companions.

Example only:

```text
uat-out/
  report.md
  findings.json
  desktop.png
  mobile.png
  trace-desktop.zip
  trace-mobile.zip
  video-desktop/
  video-mobile/
  domain/
    start-session.json
    action-tape.json
    divergence.json
```

`domain/` is not a proposed reserved name or schema yet. It illustrates that the current upload boundary is already sufficient.

The consumer owns the names and schemas until a second consumer earns a shared convention.

## Redaction and privacy

The current redaction contract is load-bearing.

A future domain artifact may contain:

- player-entered names;
- dialogue text;
- world notes;
- bug reproduction state.

Those are user/application data, not credentials, but they can still be private.

For slice 1:

- the consumer is responsible for ensuring its domain artifacts contain no secrets;
- uat-harness's existing bearer-token redaction still protects its own known token surface;
- do not claim generic redaction of arbitrary domain payloads.

If a second consumer establishes a shared domain-artifact convention, revisit whether finalization should expose an extension hook for consumer-provided scrubbers. Do not add one speculatively.

## Read-only posture

The existing network posture stays unchanged.

A game UAT run may mutate **in-browser game state** while still making no server writes. That is compatible with `UAT_READONLY=1`.

The harness must keep stating its current limit:

> read-only blocks methods/channels, not server mutation.

A domain driver does not weaken that rule.

## Findings are still not verdicts

A domain replay can produce domain assertions, checkpoints or a first-divergence report.

That does not turn generic uat-harness findings into pass/fail.

The consumer repo may have a dedicated test command that fails its own CI when a contractual checkpoint diverges. That gate belongs to the consumer.

uat-harness continues to report what the browser run showed.

## Variables and matrices

A useful debug/autoplay run may vary many things, but ownership should stay clear.

### Browser/UAT axes

Natural uat-harness concerns:

- viewport/device;
- touch vs keyboard physical surface;
- reduced motion;
- browser console/network behavior;
- accessibility;
- trace/video/screenshots.

### Domain axes

Consumer-owned concerns:

- game seed;
- scenario/session capsule;
- route/tape;
- difficulty;
- save/reload point;
- agent strategy;
- domain state assertions.

This split keeps uat-harness general-purpose.

## CI boundary

`ci-harness/.github/workflows/reusable-uat.yml` already:

- accepts a caller-owned `uat-command`;
- lets the caller choose the output directory;
- uploads that entire directory.

Therefore the first VEFR integration does not require a ci-harness interface change.

If later work needs multiple named artifact classes or structured summaries across consumers, file that need with measured evidence rather than widening the reusable workflow now.

## What would earn a generic adapter later

Revisit a shared adapter only if a second domain has all of these:

1. a stable observation/action driver;
2. portable run artifacts;
3. a need to drive them through real browser inputs;
4. the same lifecycle problem VEFR has;
5. duplication that cannot be handled cleanly by a caller-owned command.

At that point, compare the two consumers and extract only their proven intersection.

## Proposed proof for VEFR integration

A future VEFR UAT run should be able to:

1. start Chromium through the existing harness path;
2. load a known scenario/session;
3. replay a tape using real keyboard or touch input;
4. verify the domain reports the expected logical actions/checkpoints;
5. keep ordinary screenshots/video/trace/axe evidence;
6. write the VEFR capsule/tape/divergence data under the same output directory;
7. finalize/redact the existing harness artifacts exactly as today.

No VEFR-specific parser belongs in uat-harness for that proof.

## Game decks: the library seam (added 2026-10-30)

The owner decided on 2026-10-30 that a player which is not a person takes part in the UAT cycle for every game and product; this is tracked in [#47](https://github.com/rylee-bee-labs/uat-harness/issues/47). For games it is the "game decks via product drivers" row of the human-shaped UAT design (`docs/superpowers/specs/2026-10-28-human-shaped-uat-design.md`): the game repo owns its rules, its action tape and its player; this repo supplies the guarded browser around them. That lifts the park on #5 **for the game-deck line only**. The recommendation above still stands: no generic runtime API here, and no shared adapter until a second game repeats the wiring.

### The seam

A game's own UAT command borrows six exports that already exist. Nothing new is added to the runtime.

| Export | Module | What the game uses it for |
|---|---|---|
| `startFixtureServer` | `lib/journey/fixture-server.cjs` | serve a built copy of the game on 127.0.0.1, on a port the OS picks, and record every request |
| `verifyIdentity` | `lib/journey/fixture-server.cjs` | prove the target is the fixture that was just started (one-time nonce) before trusting it |
| `installCdpRequestPolicy` | `lib/netpolicy.cjs` | confine the browser to that origin and to reads, re-checked at every hop; takes a `decide` hook and an `onBlock` hook, and returns `attachPage` |
| `installWebSocketPolicy` | `lib/netpolicy.cjs` | drop whatever a page sends over a WebSocket, and report it |
| `decideFixtureRequest` | `lib/policy.cjs` | the decision to give `installCdpRequestPolicy`: the fixture origin may be read, anything else is stopped |
| `finalizeArtifacts` | `lib/artifacts.cjs` | redact the hidden staging directory, then promote it, failing closed |

The game's command loads them with `createRequire` from a uat-harness checkout named by an environment variable (the same way a Playwright module is located), so the game repo gains no dependency. If the variable is unset, or the modules do not load, the browser part reports `NOT RUN (no network guard)` and never runs unguarded.

The wiring, in order: start the fixture and verify its identity; open a context with service workers blocked; install the request and WebSocket policies, and attach each page before its first navigation; **self-test the guard** (a write to the fixture origin and a request to another address must both be stopped, or the run is NOT RUN); play; write artifacts to the staging directory; finalize. `tests/unit/library-seam.test.cjs` pins the names and the options above, so a refactor here cannot silently break a game repo. If that test has to change, the change reaches other repos: say so in the PR and update the consumers first.

### What stays where

| In the game repo | Here |
|---|---|
| the rules adapter (start, observe, actions, act), the action tape, the players, the replay runner, the verdict rows | the guard, the fixture server, the finalizer, the generic axe pass (`uat.py URL`, run on the same served build) |

Real-device checks stay UNKNOWN: browser touch emulation is not a device.

### Artifact layout of a game-deck run

Example only; the game repo owns the names and schemas until a second game earns a shared convention.

```text
<out>/
  report.json           one row per question (legality, solvability, usability, accessibility, performance,
                        save/reload, physical device); each PASS, FAIL, NOT RUN (reason) or UNKNOWN, with evidence
  divergence.json       the first step where the screen and the game's own model disagree: step, pile, seen, want
  mismatch-0040.png     the screen at that step
  untappable-0075.png   a legal action that no tap sequence can make is a finding, with a screenshot
```

Two rules carry over from the sections above. The game's command may exit non-zero on its own legality or divergence (that gate belongs to the game); findings reported by this repo stay non-gating. And every player run says what the player could see: a bot that read hidden state is labelled as such, and a win it finds means "a win exists for a player who could peek", never "this is easy to win".

### When to extract a shared function

When a second game repeats the same wiring (start the fixture, install the guard, self-test it, finalize), extract one function, for example `withGuardedFixture()`, with its own test. Not before: this is the rule the sections above already set.

## Decision

For #5: **KEEP SEPARATE, INTEGRATE THROUGH ARTIFACTS/COMMANDS FIRST.**

This is deliberately a small answer. VEFR gets the Player Driver. uat-harness stays the trustworthy pair of eyes and hands around it.

Update 2026-10-30: the same answer holds for game decks. They integrate through the six-export seam above and through artifacts and commands; there is still no generic runtime API.
