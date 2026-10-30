# Project Home through a newcomer's eyes: a pain day

Run 2026-10-30. Short lines on purpose.
**Look-only.** A local copy of the built app with made-up data. Nothing live was touched.
Nothing was answered, approved, sent or cleared.

Goal: "It's a pain day. Open Home and find, in under a minute, the one thing that needs me and who is waiting on whom."

## At a glance

- **Got there? PARTLY.** I found the one thing. I could not find who is waiting on whom.
- **Under a minute?** Yes on the scripted newcomer's clock (6.1 s). For a person: UNKNOWN.
- **Time:** 6.1 s on the scripted newcomer's clock; 21 Tab presses and 2 Enter presses. A person was not timed (UNKNOWN).
- **Top 3 cold spots:**
  1. The card says what is asked, not who is asking.
  2. Home says 2 waiting for you, but not what.
  3. No "skip to content" link: 13 Tab stops come before the page's own content.
- **Who acts next:** A Project Home agent can make the change; Rylee approves it (a product change).

## Did I get there?

**PARTLY.** The check was made by the harness, outside the newcomer, against the planted seed data (verified by: oracle).

- What needs me: found (`Approve the Garden Gate plan?`).
- Who is waiting on whom: NOT found on screen. Looked for: `moss-agent`. Seen: none.

Please read the minutes kindly:

- This was a scripted newcomer, not a model and not a person. It follows the goal's words and uses only the keyboard.
- It reads the screen as text and accessible names. It does not look at pictures.
- A real person would be slower and would also scan by eye. By how much: UNKNOWN.

## The timed log

| When | Step | What happened |
|---|---|---|
| +0.0 s | start | Started a local copy of the app with made-up data. It proved who it is with a one-time code. |
| +1.4 s | look | Home is open. On the first screen I can read "waiting for you" (142 words on screen). |
| +1.9 s | find-waiting | Tab 6: "Inbox, 2 waiting" (in Primary). Sounds right. |
| +2.8 s | find-waiting | Enter. Now on /inbox. |
| +3.0 s | open-first-item | Tab 15: "▸ Approve the Garden Gate plan?" (in Waiting on you). Sounds right. |
| +3.9 s | read | Read the page. Found the thing waiting: "Approve the Garden Gate plan?" |
| +3.9 s | read | Could not find who is waiting (moss-agent) anywhere on the page. |
| +5.2 s | phone | Phone Home: "waiting for you" starts 230 px down a 844 px screen. |
| +6.0 s | phone | Phone Inbox: the thing waiting is on the first screen. |

## Warm moments

1. **On a phone, "waiting for you" is on the first screen.**
   Its line starts 230 px down a 844 px screen, and it is a link of 44 px height. (`web/src/screens/Hall.tsx:250`)
2. **Every control I measured is at least 44 px.**
   Measured 36 on Home and 18 on the phone's Home: none under 44 px. (`web/src/screens/Hall.tsx`)
3. **With "reduce motion" on, nothing loops.**
   I turned on the browser's reduced-motion setting and counted endless animations on Home, Inbox and the phone's Home: none. (`web/src/screens/Hall.tsx`)
4. **The count on Home matches the Inbox.**
   Home said 2 waiting for you and the Inbox's "Waiting on you" section lists 2. (`web/src/screens/Inbox.tsx:228`)
5. **The way to "waiting for you" took 6 Tab presses and one Enter.**
   Tab 6 landed on "Inbox, 2 waiting", the side bar's Inbox link, which already says how many wait. It is a link, so it only opens a page. (`web/src/screens/Hall.tsx`)
6. **The Inbox uses the goal's own words.**
   The page says "Decisions first. Notices below." and the section is called "Waiting on you". Nothing to translate. (`web/src/screens/Inbox.tsx:187`)
7. **The first card puts the suggested answer first, marked "(Recommended)".**
   A tired reader can see what the agent suggests before reading anything else on the card. (`web/src/components/DecisionCard.tsx:383`)

## Cold spots (ranked)

Most felt first. A finding is evidence for a person to weigh, not a pass or fail.

### 1. The card says what is asked, not who is asking

- **Where:** Inbox, the first decision card (opened). Look in `web/src/components/DecisionCard.tsx:293`.
- **What happened:** The card shows the question, "Pending", the suggested answer and "filed 1h ago". After opening it I still could not read who is waiting (moss-agent). The seed data carries it (the app stores who filed each card); the screen does not show it.
- **Why it matters:** The goal was "who is waiting on whom". Without it, the newcomer knows something is asked of them but not by whom.
- **Suggestion:** Show "from <agent>" on the card's second line (the app already has who filed it), and in the Hall's Today row.
- **Who acts next:** A Project Home agent can make the change; Rylee approves it (a product change).

### 2. Home says 2 waiting for you, but not what

- **Where:** Home (the Hall), first screen. Look in `web/src/screens/Hall.tsx:151`.
- **What happened:** The Today row is a count and a link. The thing itself ("Approve the Garden Gate plan?") is two screens away: Home, then Inbox, then open the card.
- **Why it matters:** On a pain day she wants the top thing and who acts next on one screen, without opening anything.
- **Suggestion:** Under the count, show the newest or most urgent one as a single line, with who asked.
- **Who acts next:** A Project Home agent can make the change; Rylee approves it (a product change).

### 3. No "skip to content" link: 13 Tab stops come before the page's own content

- **Where:** Every screen with the side bar (Home, Inbox). Look in `web/src/App.tsx:296`.
- **What happened:** With the keyboard, the first Tab lands on "Hall". To reach the first thing in the Inbox's content I crossed 13 controls (side links, Find, the bell, Sign out and the nine hotbar buttons). The whole journey took 21 Tab presses.
- **Why it matters:** Keyboard first is how she works. A screen reader user hits the same wall.
- **Suggestion:** Add a first-in-order "Skip to content" link that jumps to <main>.
- **Who acts next:** A Project Home agent can make the change; Rylee approves it (a product change).

### 4. 11 words on Home's first screen would stop a newcomer

- **Where:** Home (the Hall), first screen. Look in `web/src/screens/Hall.tsx`.
- **What happened:** "Estate", "DevErquest", "Hall", "Quest Journal", "expedition", "Calling", "Core online", "Tools", "Table", "Party", "Jot".
- **Why it matters:** Each one needs a guess before the reader can act.
- **Suggestion:** Prefer the plain name first (see the list below).
- **Who acts next:** Rylee decides which names stay (they are part of the world's voice).

## Words a newcomer wouldn't know

- **Estate** (Home (first screen), Inbox): maybe "the whole set of projects (Home calls it "the Estate")". First match in the source: `web/src/components/Inspector.tsx:203`.
- **DevErquest** (Home (first screen), Inbox): maybe "the game-like view of the agents' work". First match in the source: `web/src/screens/Hall.tsx:288`.
- **Hall** (Home (first screen), Inbox): maybe "the front page". First match in the source: `web/src/App.tsx:61`.
- **Quest Journal** (Home (first screen)): maybe "the page that lists the agents' work". First match in the source: `web/src/components/shell/PhoneEntry.tsx:30`.
- **expedition** (Home (first screen)): maybe "one running mission of agent work". First match in the source: `web/src/screens/Hall.tsx:153`.
- **Calling** (Home (first screen)): maybe "a project or door that is asking for you". First match in the source: `web/src/components/QuestMark.tsx:13`.
- **Core online** (Home (first screen), Inbox): maybe "whether the Home service itself is up". First match in the source: `web/src/screens/Settings.tsx:489`.
- **Tools** (Home (first screen), Inbox): maybe "a folded group of other pages". First match in the source: `web/src/components/shell/Navigation.tsx:93`.
- **Look later** (Inbox): maybe "put this card off for now". First match in the source: `web/src/components/DecisionCard.tsx:474`.
- **Table** (Home (first screen), Inbox): maybe "a page of art choices". First match in the source: `web/src/components/ProjectRoom.tsx:99`.
- **Party** (Home (first screen), Inbox): maybe "the agents, shown as characters". First match in the source: `web/src/components/Expeditions.tsx:151`.
- **Jot** (Home (first screen), Inbox): maybe "write a quick note". First match in the source: `web/src/lib/verbs.ts:20`.

The list was made by reading the screens. It is not exhaustive.

## Look-only check

- Guard self-test, before the walk: a test write and a test request to another address were both blocked in the browser.
- Write attempts blocked in the browser: **0**.
- Requests to anywhere but the local copy, blocked: **0**.
- Writes that reached the local copy's server: **0**.
- Controls the newcomer chose not to press: none came up.
- The newcomer typed nothing.

## Coverage receipt

- Engine: Chromium 153.0.8010.12, simulated. Desktop 1280 by 800 (keyboard). Phone 390 by 844 (touch emulation).
- Newcomer: scripted (no model). Marks assist: none.
- Fixture: `project-home-mocked`, loopback only, one-time nonce checked: yes.
- Product build: Project Home main at f761aabd, built with vite only (type-check not run).
- Reduced motion: on for every pass.
- Physical phone: **UNKNOWN, not observed.**
- Real screen reader (NVDA, JAWS, VoiceOver): **UNKNOWN, not observed.** The accessible names above come from the browser's own tree.
- A person doing the journey: **UNKNOWN, not observed.**
- Live data and sign-in: **not used, by design.**

## Screenshots

- `private/screens/01-home-desktop.png`: Home (the Hall) on a 1280 by 800 desktop, as first seen
- `private/screens/02-home-focus.png`: Home with keyboard focus on the control the newcomer picked
- `private/screens/03-inbox-desktop.png`: The page the newcomer reached, before opening anything
- `private/screens/04-inbox-opened.png`: The first waiting card, opened (still nothing answered)
- `private/screens/05-home-phone.png`: Home on a 390 by 844 phone, first screen only
- `private/screens/06-inbox-phone.png`: Inbox on the phone after one tap, first screen only

Screenshots stay with the run (spec: raw evidence is private). They show made-up data only.

## UNKNOWN

- A person was not timed. The minutes in this report are the scripted newcomer's clock.
- A real phone and a real screen reader were not used (see the coverage receipt).
- Whether a small vision model would do better or worse than this script: not run. None is available here.

Findings are evidence, not pass/fail.
