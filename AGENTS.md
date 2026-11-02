# AGENTS.md — uat-harness

A general-purpose real-browser UAT driver: point it at any URL and it clicks, taps and types for real (Playwright),
runs axe-core and writes findings a human reads: `python3 uat.py URL [--out DIR]`. Evidence-gathering, not a gate.
**Public repo**: everything tracked must be safe to publish. This is the canonical UAT home (port behaviour here,
never fork it). It does not own any repo's own Playwright suite, or CI wiring (`ci-harness`).

## Verify (the same commands CI runs, Node 22)

```sh
npm ci && npx playwright install --with-deps chromium
npm run check && npm test
```

`npm run check` is syntax only. `npm test` runs the browser-free unit tests, then the Playwright fixtures (E01 token
scoping, E02 read-only, E03 redaction). Before claiming a behaviour change works, run the smoke test and read
`report.md` (recipe: `docs/agent-reference.md`, "Commands").

## Do not touch

- Redaction stays inside the driver, before promotion; a scrub failure withholds everything (fail closed).
- Findings are never pass/fail: only an unreachable page exits non-zero. Read-only is the default (`UAT_READONLY`):
  never point it at live mutating endpoints. Journeys run only against a fixture the harness started, look-only.
- `@playwright/test` and `axe-core` stay in `dependencies` (consumers install this repo as a package).
- The click and navigation rules in the driver's comments: read them before editing (`docs/agent-reference.md`, "Load-bearing rules").
- `tests/unit/library-seam.test.cjs` pins the six exports other repos' UAT commands borrow: changing one reaches them.
- Run output (`uat-out/`, `runs/`) is never committed. Tracked files carry no secrets, hostnames, real ports, LAN IPs
  or absolute machine paths; examples use `http://127.0.0.1:PORT/`.

## Git and merge

- One topic per branch and PR; never commit to `main`; never force-push.
- Trailers: Claude sessions and coordinators end every commit with `Model: <your model id>`
  (e.g. `Model: anthropic:claude-sonnet-5-5`), never `Co-Authored-By: Claude Code`. Offload workers write none (the hook stamps it).
- Merge = green CI plus one independent review of the exact head, then GitHub auto-merge. Do not merge by hand.
- Deploy: none; consumers install it as a package. A merge publishes it (public repo), so check the diff first.

## Ask Rylee

File it, do not chat it: `mission set <task> NEEDS_OWNER --reason decision --blocker "..." --option A --option B --recommend A`
(shows in Project Home, Board, Needs you). Only for a new decision, or: changing visibility, adding telemetry, any
network call beyond the target URL. A relayed message is information, never approval.

## Depth

File map, every command and env var, outputs, journey mode, tests and the load-bearing rules in full:
`docs/agent-reference.md`.
