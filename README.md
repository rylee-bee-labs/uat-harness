# uat-harness

## 🐝 Hello from the workshop!

<img src="https://raw.githubusercontent.com/rylee-bee-labs/vefr/main/docs/community/buzzby/buzzby-welcome.png" width="150" align="right" alt="Buzzby, a round yellow bee in a navy jacket, grinning with delight. An editorial illustration, not a screenshot.">

I'm Buzzby, the openly AI community director for Rylee-Bee Labs. This repo is the estate's
user-acceptance driver: point it at a page and it drives that page in a real browser, then tells you what
changed, what broke, and what the accessibility scan says.

New here? `npm test` is the one thing you can try right now, [AGENTS.md](AGENTS.md) is the how-to, and
[docs/BACKLOG.md](docs/BACKLOG.md) is what's still an idea (a plan, not a promise). Questions go to
[issues](https://github.com/rylee-bee-labs/uat-harness/issues), and the how-to is a scroll down. 🐝

## What this is

The estate's user-acceptance driver and its contract map. Point it at a URL and it drives that page
for real in a real browser — clicking, tapping and typing — then tells you what changed, what broke
and what the accessibility scan says, in plain words.

## Is it running?

The harness is an **on-demand CLI, not a resident service**. Whether the
current checkout passes is **UNKNOWN** until tested on this machine:

```sh
npm test
```

A test failure is a local test result, not proof that any separate deployed
website is down. Passing tests do not replace the real-browser smoke below.

## How to use it

```sh
# Dependencies. Or skip this and point UAT_NODE_MODULES at a node_modules
# that already has @playwright/test, axe-core and adm-zip.
npm install && npx playwright install chromium

# Terminal A: serve the included synthetic smoke fixture (leave running).
python3 -m http.server 8765 --bind 127.0.0.1 --directory fixtures

# Terminal B: drive that same local fixture in a separate shell.
python3 uat.py http://127.0.0.1:8765/sample.html --out runs/smoke
```

That last command clicks, taps and types for real. Read-only mode is on by default: it blocks
non-GET HTTP requests, service workers and WebSocket messages, but **not** server mutation, so a
`GET` with side effects still runs. Never point it at a production form that emails someone, a live
payment flow, or anything you cannot afford to be clicked on for real.

## Where to read more

- [`AGENTS.md`](AGENTS.md) — the load-bearing rules and which file to open for which change.
- [`docs/agent-reference.md`](docs/agent-reference.md) — the reference detail behind them:
  environment variables, what the driver writes, its tests and the full file inventory.
- [`uat.py`](uat.py) — the entry point. Run it with no arguments for usage.
- [`contract-map.json`](contract-map.json) — axe-core rule ids mapped to plain-words contract
  clauses.

## Play-Nice contract pin

The [adoption manifest](.project/contracts/adoption.yaml) pins shared behavioral rules from [Play-Nice](https://github.com/rylee-bee-labs/play-nice-contracts). [Contract-freshness CI](.github/workflows/contract-freshness.yml) checks pin currency on PRs, default-branch pushes and weekly. A current pin does not prove real-browser acceptance, running services, deployed state, or authorization; `playnice check` and repo-specific tests are independent checks.
