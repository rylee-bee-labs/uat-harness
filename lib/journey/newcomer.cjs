// The scripted newcomer (Phase 1). No model: it follows the words of the goal, using only what a person
// could perceive on the screen (visible text and the accessible name of whatever has focus) and ordinary
// keys. It is look-only by construction: it refuses to press anything that could answer, send, approve,
// clear or withdraw. Pure helpers are exported for unit tests; `runStep` drives a real page.
"use strict";

const { focusDescriptor } = require("./probes.cjs");

// May the newcomer press Enter on this? A link only navigates (a GET). A disclosure (aria-expanded) only
// opens and closes something on the page. Everything else could change state, so it is refused.
function canPress(desc) {
  if (!desc) return { ok: false, why: "nothing has focus" };
  if (desc.tag === "a" && desc.href) return { ok: true, why: "link: only navigates" };
  if (desc.tag === "summary") return { ok: true, why: "disclosure: only opens" };
  if ((desc.tag === "button" || desc.role === "button") && desc.expanded !== null && desc.expanded !== undefined) {
    return { ok: true, why: "disclosure button: only opens or closes" };
  }
  return { ok: false, why: `look-only: would not press a ${desc.role || desc.tag} named "${desc.name}"` };
}

// Does this focus stop sound like what the goal asked for? Names are matched in lower case; region cues
// match the section the control sits in. Returns a score (0 = no match); an earlier cue scores higher.
function cueScore(desc, { cues = [], regionCues = [] } = {}) {
  if (!desc) return 0;
  const name = String(desc.name || "").toLowerCase();
  const region = String(desc.region || "").toLowerCase();
  let best = 0;
  cues.forEach((c, i) => { if (name.includes(String(c).toLowerCase())) best = Math.max(best, cues.length - i); });
  regionCues.forEach((c, i) => { if (region.includes(String(c).toLowerCase())) best = Math.max(best, regionCues.length - i); });
  return best;
}

// One step: press Tab until a pressable stop sounds right (or the cap), then press Enter on it.
// Returns what happened, key counts and every stop passed, so a report can say what a person would have crossed.
async function runStep(page, step, { maxTabs = 40, settleMs = 900, log, startFrom = 0 } = {}) {
  const stops = [];
  const refused = [];
  let target = null;
  for (let i = 1; i <= maxTabs; i++) {
    await page.keyboard.press("Tab");
    const d = await focusDescriptor(page);
    stops.push(d);
    if (!d) continue;
    const score = cueScore(d, { cues: step.cues, regionCues: step.region_cues });
    if (score > 0) {
      const can = canPress(d);
      if (can.ok) { target = { index: i, desc: d, why: can.why }; break; }
      refused.push({ stop: i, name: d.name, why: can.why });
    }
  }
  if (!target) {
    if (log) log(`Pressed Tab ${stops.length} times and found nothing that sounds like "${step.say}".`);
    return { found: false, tabs: stops.length, stops, refused, enters: 0 };
  }
  if (log) log(`Tab ${target.index}: "${target.desc.name}"${target.desc.region ? ` (in ${target.desc.region})` : ""}. Sounds right.`);
  return { found: true, tabs: target.index, stops, refused, target, enters: 0, settleMs };
}

module.exports = { canPress, cueScore, runStep };
