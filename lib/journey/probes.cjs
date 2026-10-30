// Page measurements for a journey. Each probe reads the page the way a person's tools could (layout boxes,
// the accessible name, the heading list, what is on the first screen). None of them clicks or types.
"use strict";

const fs = require("fs");

// Run inside the page. Returns plain data only.
function inPage(minTarget) {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const nameOf = (el) => (el.getAttribute("aria-label") || el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 90);
  const interactive = Array.from(document.querySelectorAll("a[href], button, [role=button], [role=link], summary, input, select, textarea, [tabindex]"))
    .filter((el) => el.tabIndex >= 0 && vis(el) && !el.disabled);
  const small = interactive.map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => Math.min(r.width, r.height) < minTarget)
    .map(({ el, r }) => ({ name: nameOf(el) || `<${el.tagName.toLowerCase()}>`, w: Math.round(r.width), h: Math.round(r.height) }));

  // Text that is on the first screen (inside the viewport), in reading order.
  const words = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.nodeValue.replace(/\s+/g, " ").trim();
    if (!t) continue;
    const p = n.parentElement;
    if (!p || !vis(p) || p.closest("[aria-hidden=true]")) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth) {
      if (!seen.has(t + r.top)) { seen.add(t + r.top); words.push({ t, top: Math.round(r.top), left: Math.round(r.left) }); }
    }
  }
  words.sort((a, b) => (a.top - b.top) || (a.left - b.left));

  const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role=heading]"))
    .filter(vis).map((h) => ({ level: Number(h.tagName[1]) || Number(h.getAttribute("aria-level")) || 0, text: nameOf(h) }));
  const anims = document.getAnimations ? document.getAnimations().filter((a) => {
    const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : {};
    return a.playState === "running" && t.iterations === Infinity;
  }).map((a) => (a.animationName || a.transitionProperty || "animation")) : [];
  return {
    url: location.pathname + location.search, title: document.title,
    scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
    viewport: { w: innerWidth, h: innerHeight },
    firstScreenText: words.map((w) => w.t).join(" \n"),
    firstScreenWordCount: words.map((w) => w.t).join(" ").split(/\s+/).filter(Boolean).length,
    headings,
    landmarks: { main: !!document.querySelector("main,[role=main]"), nav: !!document.querySelector("nav,[role=navigation]"), banner: !!document.querySelector("header,[role=banner]") },
    interactiveCount: interactive.length, smallTargets: small,
    runningInfiniteAnimations: anims,
    bodyText: document.body.innerText.replace(/[ \t]+/g, " ").slice(0, 20000),
  };
}

async function measure(page, { minTarget = 44 } = {}) {
  const m = await page.evaluate(inPage, minTarget);
  m.overflowX = m.scrollW > m.clientW + 1;
  return m;
}

// Which element has focus, as a person using the keyboard would describe it.
async function focusDescriptor(page) {
  return page.evaluate(() => {
    const e = document.activeElement;
    if (!e || e === document.body || e === document.documentElement) return null;
    const r = e.getBoundingClientRect();
    const region = (() => {
      const sec = e.parentElement && e.parentElement.closest("[aria-label],[aria-labelledby],[role=region],section,nav,header,main");
      if (!sec) return "";
      const lab = sec.getAttribute("aria-label");
      if (lab) return lab;
      const id = sec.getAttribute("aria-labelledby");
      const h = id && document.getElementById(id);
      return h ? h.textContent.trim() : "";
    })();
    const name = (e.getAttribute("aria-label") || e.innerText || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120);
    const href = e.getAttribute && e.getAttribute("href");
    return {
      tag: e.tagName.toLowerCase(), role: e.getAttribute("role"), name, region, href: href || null,
      expanded: e.getAttribute("aria-expanded"), type: e.getAttribute("type"), inMain: !!e.closest("main,[role=main]"),
      box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    };
  });
}

// axe-core, serious and critical only, as short plain records (rule, why it matters, first place).
async function runAxe(page, { contractMap = {} } = {}) {
  const src = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  await page.evaluate(src);
  const res = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => ({
      id: v.id, impact: v.impact, help: v.help, count: v.nodes.length,
      first: v.nodes[0] ? { target: v.nodes[0].target.join(" "), html: String(v.nodes[0].html).slice(0, 140) } : null,
    }));
  });
  return res.map((v) => ({ ...v, clause: contractMap[v.id] || "general accessibility" }));
}

module.exports = { measure, focusDescriptor, runAxe, inPage };
