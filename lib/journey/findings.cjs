// Turn a journey's evidence into plain findings: warm moments, cold spots (ranked), words a newcomer
// would not know. Pure: evidence in, findings out, no browser. Every finding states the evidence it
// stands on; a charming thing is only called warm when something measured says so (never decoration).
"use strict";

const NEXT = "A Project Home agent can make the change; Rylee approves it (a product change).";
const first = (arr) => (Array.isArray(arr) && arr.length ? arr[0] : null);

function numberBefore(text, re) {
  const m = String(text || "").match(re);
  return m ? Number(m[1]) : null;
}

// How many Tab presses went by before focus first reached the page's own content (<main>).
function tabsBeforeMain(stops) {
  const i = (stops || []).findIndex((s) => s && s.inMain);
  return i === -1 ? null : i; // stops before the first one inside main
}

function buildFindings(ev, { jargon = {}, hints = {} } = {}) {
  const cold = [];
  const warm = [];
  const unknowns = [];
  const d = ev.desktop || {};
  const p = ev.phone || {};
  const home = d.home && d.home.measure;
  const inbox = d.inbox && d.inbox.measure;
  const phoneHome = p.home && p.home.measure;
  const phoneInbox = p.inbox && p.inbox.measure;
  const stepsD = d.steps || [];
  const step1 = stepsD[0];
  const step2 = stepsD[1];
  const ref = (key, needle) => ({ file: hints[key] || null, needle: needle || null });

  // 1. Who is waiting on whom: the answer's second half.
  if (ev.oracle && ev.oracle.who_is_waiting && !ev.oracle.who_is_waiting.ok) {
    cold.push({
      id: "who-not-shown", severity: 3, screen: "Inbox, the first decision card (opened)",
      title: "The card says what is asked, not who is asking",
      what: `The card shows the question, "Pending", the suggested answer and "filed 1h ago". After opening it I still could not read who is waiting (${(ev.oracle.who_is_waiting.missing || []).join(", ")}). The seed data carries it (the app stores who filed each card); the screen does not show it.`,
      why: "The goal was \"who is waiting on whom\". Without it, the newcomer knows something is asked of them but not by whom.",
      suggestion: "Show \"from <agent>\" on the card's second line (the app already has who filed it), and in the Hall's Today row.",
      next: NEXT,
      ref: ref("Decision card", "filed {timeAgo"),
    });
  }

  // 2. Home says how many, not what.
  if (home && ev.planted && !String(home.bodyText).includes(ev.planted.question)) {
    const n = numberBefore(home.bodyText, /(\d+)\s*\n?\s*waiting for you/i);
    cold.push({
      id: "home-counts-not-items", severity: 2, screen: "Home (the Hall), first screen",
      title: `Home says ${n === null ? "that things are" : n} waiting for you, but not what`,
      what: `The Today row is a count and a link. The thing itself (\"${ev.planted.question}\") is two screens away: Home, then Inbox, then open the card.`,
      why: "On a pain day she wants the top thing and who acts next on one screen, without opening anything.",
      suggestion: "Under the count, show the newest or most urgent one as a single line, with who asked.",
      next: NEXT,
      ref: ref("Hall", 'what: "waiting for you"'),
    });
  }

  // 3. Keyboard cost: tabs before the page's own content.
  const before2 = step2 ? tabsBeforeMain(step2.stops) : null;
  const before1 = step1 ? tabsBeforeMain(step1.stops) : null;
  const noSkip = step1 && step1.stops && !(step1.stops[0] && /skip/i.test(step1.stops[0].name || ""));
  const totalTabs = (step1 ? step1.tabs : 0) + (step2 ? step2.tabs : 0);
  const crossed = before2 === null ? (before1 === null ? 0 : before1) : before2;
  if (noSkip && crossed >= 5) {
    cold.push({
      id: "no-skip-link", severity: 2, screen: "Every screen with the side bar (Home, Inbox)",
      title: `No "skip to content" link: ${crossed} Tab stops come before the page's own content`,
      what: `With the keyboard, the first Tab lands on "${(step1.stops[0] || {}).name}". To reach the first thing in the Inbox's content I crossed ${crossed} controls (side links, Find, the bell, Sign out and the nine hotbar buttons). The whole journey took ${totalTabs} Tab presses.`,
      why: "Keyboard first is how she works. A screen reader user hits the same wall.",
      suggestion: "Add a first-in-order \"Skip to content\" link that jumps to <main>.",
      next: NEXT,
      ref: ref("Shell", "<main"),
    });
  }

  // 4. Phone: is the answer on the first screen?
  if (phoneHome) {
    const cue = p.home.cue;
    if (!cue || cue.y >= phoneHome.viewport.h) {
      cold.push({
        id: "phone-first-screen", severity: 3, screen: "Home on a 390 px phone",
        title: "On a phone, the \"waiting for you\" line is not on the first screen",
        what: cue ? `It starts ${cue.y} px down; the screen is ${phoneHome.viewport.h} px tall.` : "I could not find a \"waiting for you\" line without scrolling.",
        why: "One glance should show the top things and who acts next.",
        suggestion: "Keep the Today scroll as the first thing on a phone, above the painting.",
        next: NEXT, ref: ref("Hall", "hall-today"),
      });
    } else {
      warm.push({
        id: "phone-first-screen-ok", title: "On a phone, \"waiting for you\" is on the first screen",
        text: `Its line starts ${cue.y} px down a ${phoneHome.viewport.h} px screen, and it is a link of ${cue.h} px height.`,
        ref: ref("Hall", "hall-today"),
      });
    }
  }

  // 5. Small tap targets and sideways scroll (phone first; desktop too).
  const smalls = [["Home on a phone", phoneHome], ["Inbox on a phone", phoneInbox], ["Home on a desktop", home], ["Inbox on a desktop", inbox]]
    .filter(([, m]) => m && m.smallTargets && m.smallTargets.length);
  if (smalls.length) {
    const [where, m] = smalls[0];
    cold.push({
      id: "small-targets", severity: 3, screen: where,
      title: `${smalls.reduce((n, [, mm]) => n + mm.smallTargets.length, 0)} controls are smaller than 44 px`,
      what: `${smalls.map(([w, mm]) => `${w}: ${mm.smallTargets.length}`).join("; ")}. Smallest: "${m.smallTargets[0].name}" at ${m.smallTargets[0].w} by ${m.smallTargets[0].h} px.`,
      why: "Small taps are hard on a pain day and on a phone.", suggestion: "Give each at least 44 by 44 px of tap area.",
      next: NEXT, ref: ref("Hall", null),
    });
  } else if (phoneHome && home) {
    warm.push({
      id: "targets-44", title: "Every control I measured is at least 44 px",
      text: `Measured ${home.interactiveCount} on Home and ${phoneHome.interactiveCount} on the phone's Home: none under 44 px.`, ref: ref("Hall", null),
    });
  }
  const overflowing = [["Home on a phone", phoneHome], ["Inbox on a phone", phoneInbox]].filter(([, m]) => m && m.overflowX);
  if (overflowing.length) {
    cold.push({
      id: "sideways-scroll", severity: 2, screen: overflowing.map(([w]) => w).join(", "),
      title: "The page scrolls sideways on a phone",
      what: overflowing.map(([w, m]) => `${w}: content is ${m.scrollW} px wide in a ${m.clientW} px window`).join("; "),
      why: "Sideways scrolling hides things and is hard one-handed.", suggestion: "Find the wide element and let it wrap.",
      next: NEXT, ref: ref("Hall", null),
    });
  }

  // 6. Motion under "reduce".
  const moving = [["Home", home], ["Inbox", inbox], ["Home on a phone", phoneHome]]
    .filter(([, m]) => m && m.runningInfiniteAnimations && m.runningInfiniteAnimations.length);
  if (moving.length) {
    cold.push({
      id: "motion-under-reduce", severity: 3, screen: moving.map(([w]) => w).join(", "),
      title: "Something keeps moving even though the browser asked for reduced motion",
      what: moving.map(([w, m]) => `${w}: ${m.runningInfiniteAnimations.length} endless animation(s) (${[...new Set(m.runningInfiniteAnimations)].join(", ")})`).join("; "),
      why: "Motion can set off a migraine. \"Reduce motion\" should stop it.", suggestion: "Stop looping animations inside prefers-reduced-motion.",
      next: NEXT, ref: ref("Hall", null),
    });
  } else if (home && inbox) {
    warm.push({
      id: "motion-calm", title: "With \"reduce motion\" on, nothing loops",
      text: "I turned on the browser's reduced-motion setting and counted endless animations on Home, Inbox and the phone's Home: none.", ref: ref("Hall", null),
    });
  }

  // 7. axe (serious and critical).
  for (const [screen, list] of Object.entries(d.axe || {})) {
    if (!list || !list.length) continue;
    const f = first(list);
    cold.push({
      id: `axe-${screen}`, severity: list.some((v) => v.impact === "critical") ? 3 : 2, screen: `${screen} (desktop)`,
      title: `${list.length} serious accessibility problem${list.length === 1 ? "" : "s"} found by the automatic checker`,
      what: list.map((v) => `${v.help} (${v.count}x, ${v.id}; ${v.clause})`).join("; ") + (f && f.first ? `. First place: ${f.first.target}` : ""),
      why: "A screen reader or a keyboard may not be able to use these parts.", suggestion: "Fix each rule at its first place.",
      next: NEXT, ref: ref(screen === "Inbox" ? "Inbox" : "Hall", null),
    });
  }

  // 8. Words on the first screen.
  const words = (ev.words || []);
  const onFirst = words.filter((w) => (w.screens || []).includes("Home (first screen)"));
  if (onFirst.length >= 3) {
    cold.push({
      id: "first-screen-words", severity: 1, screen: "Home (the Hall), first screen",
      title: `${onFirst.length} words on Home's first screen would stop a newcomer`,
      what: onFirst.map((w) => `"${w.term}"`).join(", ") + ".",
      why: "Each one needs a guess before the reader can act.", suggestion: "Prefer the plain name first (see the list below).",
      next: "Rylee decides which names stay (they are part of the world's voice).", ref: ref("Hall", null),
    });
  }

  // 9. Counts disagree.
  const hallN = numberBefore(home && home.bodyText, /(\d+)\s*\n?\s*waiting for you/i);
  const inboxN = numberBefore(inbox && inbox.bodyText, /waiting on you\s*·\s*(\d+)/i);
  if (hallN !== null && inboxN !== null && hallN !== inboxN) {
    cold.push({
      id: "counts-disagree", severity: 2, screen: "Home and Inbox",
      title: `Home says ${hallN} waiting, the Inbox lists ${inboxN}`, what: `Home's Today row: ${hallN}. The Inbox heading: "Waiting on you · ${inboxN}".`,
      why: "Two numbers for one thing makes a tired reader doubt both.", suggestion: "Say where the difference lives, or show one number.",
      next: NEXT, ref: ref("Inbox", "Waiting on you"),
    });
  } else if (hallN !== null && inboxN !== null) {
    warm.push({
      id: "counts-agree", title: "The count on Home matches the Inbox",
      text: `Home said ${hallN} waiting for you and the Inbox's "Waiting on you" section lists ${inboxN}.`, ref: ref("Inbox", "Waiting on you"),
    });
  }

  // 10. Errors in the browser.
  const errs = ((ev.console || {}).errors || []).length + ((ev.console || {}).pageErrors || []).length;
  if (errs) {
    cold.push({
      id: "console-errors", severity: 1, screen: "Home and Inbox", title: `${errs} error${errs === 1 ? "" : "s"} in the browser console`,
      what: [...(ev.console.errors || []), ...(ev.console.pageErrors || [])].slice(0, 3).join(" | "), why: "A quiet error may hide a broken part.",
      suggestion: "Check whether they come from the fixture or the app.", next: NEXT, ref: ref("Hall", null),
    });
  }

  // Warm: the way in was short.
  if (step1 && step1.found) {
    const n = step1.tabs;
    warm.push({
      id: "way-in-is-short", title: `The way to "waiting for you" took ${n} Tab presses and one Enter`,
      text: `Tab ${n} landed on "${step1.target.desc.name}", the side bar's Inbox link, which already says how many wait. It is a link, so it only opens a page.`,
      ref: ref("Hall", null),
    });
  }
  if (inbox && /Waiting on you/.test(inbox.bodyText) && /Decisions first/.test(inbox.bodyText)) {
    warm.push({
      id: "inbox-says-it", title: "The Inbox uses the goal's own words",
      text: "The page says \"Decisions first. Notices below.\" and the section is called \"Waiting on you\". Nothing to translate.", ref: ref("Inbox", "Decisions first"),
    });
  }
  if (inbox && /\(Recommended\)/.test(inbox.bodyText)) {
    warm.push({
      id: "recommended-first", title: "The first card puts the suggested answer first, marked \"(Recommended)\"",
      text: "A tired reader can see what the agent suggests before reading anything else on the card.", ref: ref("Decision card", 'dc-rec">(Recommended)'),
    });
  }
  const lo = ev.lookOnly || {};
  if (lo && !(lo.reachedServer || []).length) {
    warm.push({
      id: "look-only-held", title: "Look-only held: nothing was sent",
      text: `Blocked ${(lo.blocked || []).length} write attempt${(lo.blocked || []).length === 1 ? "" : "s"} in the browser; ${(lo.reachedServer || []).length} reached the fixture server.`, ref: null, harness: true,
    });
  }
  if (!unknowns.length) {
    unknowns.push("A person was not timed. The minutes in this report are the scripted newcomer's clock.");
    unknowns.push("A real phone and a real screen reader were not used (see the coverage receipt).");
  }

  cold.sort((a, b) => b.severity - a.severity);
  return { cold, warm, unknowns };
}

// Which known hard words are on which screen (Home, Inbox), for the "words" list.
function findWords(screens, jargon) {
  const out = [];
  for (const [term, gloss] of Object.entries(jargon || {})) {
    const re = new RegExp(`(^|[^A-Za-z])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z]|$)`, "i");
    const where = Object.entries(screens).filter(([, text]) => re.test(text)).map(([name]) => name);
    if (where.length) out.push({ term, gloss, screens: where });
  }
  return out;
}

module.exports = { buildFindings, findWords, tabsBeforeMain, numberBefore };
