// Fictional seed data for the Project Home journey (canary names only: nobody and nothing here is real).
// It answers the /api/* calls the built Project Home makes on the Hall and the Inbox, in the shapes the
// app reads (checked against the app's own UI walks). A call this table does not know gets a 404 that the
// harness records, so drift between this file and the app shows up in the report instead of hiding.
"use strict";

const FIXTURE_ID = "project-home-mocked";

// The planted answer. The oracle checks the newcomer actually reached THIS card, in words on the screen:
// `question` is WHAT needs her; `asker` and `project` are WHO is waiting. The seed data carries all three on
// purpose (the app stores them), so a screen that never shows who is waiting is a finding about the screen.
const PLANTED = {
  question: "Approve the Garden Gate plan?",
  asker: "moss-agent",
  project: "Garden Gate",
};

function buildFixture(now = Date.now()) {
  const iso = (minutesAgo) => new Date(now - minutesAgo * 60000).toISOString();
  const NOW_ISO = iso(0);
  const PID = "proj-garden-gate";

  const decisions = [
    {
      id: 41, project_id: PID, question: PLANTED.question,
      context_md: "The plan is drawn. The build can start as soon as you answer.",
      options: ["Approve the plan", "Ask for changes", "Not now"], options_json: "[]",
      recommendation: "Approve the plan", status: "open", decided_choice: null, created_at: iso(95),
      source_key: "mission:garden-gate:plan", key: "mission:garden-gate:plan", created_by: `token:${PLANTED.asker}`,
      meta: { producer: "mission", reason: "decision", mission: "garden-gate", links: [] },
    },
    {
      id: 42, project_id: "proj-lantern-shed", question: "Pick the roof colour for the lantern shed?",
      context_md: "Three swatches are ready in the Studio.",
      options: ["Moss green", "Dusk plum", "Honey"], options_json: "[]",
      recommendation: "", status: "open", decided_choice: null, created_at: iso(310),
      source_key: "mission:lantern-shed:roof", key: "mission:lantern-shed:roof", created_by: "token:pebble-agent",
      meta: { producer: "mission", reason: "decision", mission: "lantern-shed", links: [] },
    },
  ];

  const attention = (over) => ({
    kind: "owner_decision", id: "d41", project_id: PID, title: PLANTED.question, detail: "", source: "decisions",
    raised_at: iso(95), age_min: 95, consequence: "The build waits until you answer.",
    action: { label: "Decide it", href: "/inbox?decision=41" }, stale: false, ...over,
  });
  // Two things wait on her, and they are the same two cards the Inbox shows, so the counts agree.
  const attentionItems = [
    attention({}),
    attention({ id: "d42", project_id: "proj-lantern-shed", title: "Pick the roof colour for the lantern shed?",
      raised_at: iso(310), age_min: 310, action: { label: "Decide it", href: "/inbox?decision=42" } }),
  ];

  const home = {
    recap: { since_last_visit: null, greeting: "Good afternoon", completed: [], active_projects: [], significant_changes: [], blockers: [], decisions_open: 2 },
    where_we_left_off: null, resume: null, projects: [], active_agents: [], active_chats: [],
    recently_saved: [], needs_attention: [], attention_items: attentionItems, activity: [],
    estate: { total_projects: 2, active_shown: 0 },
  };

  const boop = (id, over) => ({
    id, category: "approval", title: "Approve the weekly tidy", body: "Pebble wants to tidy the sample shed.",
    ref_kind: "", ref_id: "", deep_link: "/workshop?tab=tasks", dedup_key: "", state: "unread",
    channel: "none", channel_state: "unsupported", channel_ref: "", channel_error: "",
    created_at: iso(20), read_at: "", acted_at: "", ...over,
  });
  const boops = [
    boop("n1", {}),
    boop("n2", { category: "completion", title: "The lantern shed walls are done", body: "", deep_link: "/projects", created_at: iso(180) }),
  ];

  const project = (id, name, over = {}) => ({
    id, name, purpose: "A made-up project for the journey.", color: "", icon: "", lifecycle_status: "active", category: "Games",
    project_type: "game", tags: [], aliases: [], pinned: false, host: "studio", confidence: "high", source_paths: [],
    last_visit_at: iso(50), needs_review: false, missing_info: false, missing_fields: [], bookmark_source: "", bookmark: null,
    latest_milestone: "", last_verified: iso(30), statuses: {}, blocker: null, next_action: "", dirty_repos: 0, repo_count: 0,
    active_sessions: 0, attention_count: 0, git_as_of: "", git_freshest: "", ...over,
  });
  const projects = [
    project(PID, "Garden Gate", { attention_count: 1 }),
    project("proj-lantern-shed", "Lantern Shed", { attention_count: 1 }),
  ];

  const expedition = {
    id: "garden-gate", objective: "Build the garden gate", state: "ACTIVE", health: "ok", tasks_shown: 1, tasks_total: 1,
    legs: [
      { key: "brief", name: "Brief", means: "" },
      { key: "outfit", name: "Outfit", means: "", working: [] },
      { key: "venture", name: "Venture", means: "", stops: [] },
      { key: "review", name: "Review", means: "", stops: [] },
      { key: "return", name: "Return", means: "", stops: [] },
    ],
  };

  const routes = {
    "/api/auth/me": { username: "ash" },
    "/api/health": { ok: true, version: "fixture", password_provisioned: true, time: NOW_ISO },
    "/api/home": home,
    "/api/home/visit": home,
    "/api/decisions": decisions,
    "/api/boops": { notifications: boops, counts: { unread: boops.length, read: 0 },
      prefs: { categories: {}, quiet_hours: { enabled: false, start: "", end: "" }, digest: false, channel: "none" } },
    "/api/boops/prefs": { categories: {}, quiet_hours: { enabled: false, start: "", end: "" }, digest: false, channel: "none" },
    "/api/deverquest/expeditions": { schema: "expeditions/1", as_of: NOW_ISO, heartbeat_minutes: 15, expeditions: [expedition],
      freshness: { mission_snapshot: { status: "fresh", received_at: NOW_ISO, age_minutes: 1 } } },
    "/api/deverquest": { schema: "deverquest/1", as_of: NOW_ISO, tracker: null, noticeboard: [], alarms: [], zones: [], tome: [],
      party: [], chronicle: [], clock: [], unknowns: [] },
    "/api/taste-picks": { open: [], recent: [] },
    "/api/studio/status": { schema: "studio-status/1", status: "unknown", why: "Studio hasn't reported yet: nothing has been posted to Home",
      reported: false, stale_after_minutes: 60, observed_at: null, age_minutes: null, source: null, received_at: null,
      rounds: [], sketches: null, warning: null, counts: { rounds: null, by_state: {}, awaiting_pick: null, unreadable: null } },
    "/api/gallery/recent": { status: "fresh", why: null, read_at: NOW_ISO, url: "/",
      updates: [], wall: [{ project_id: PID, project_name: "Garden Gate", title: "Gate sketch", set: "gate",
        url: "/art/deverquest/scene-expedition-trail-800.webp", set_url: "/", updated: NOW_ISO }] },
    "/api/whats-live": { checked_at: NOW_ISO, apps: [{ id: "ph", name: "Project Home", branch: "main", remote_head: "a", running: "a", behind: 0, status: "current" }] },
    "/api/approvals": { approvals: [] },
    "/api/projects": { projects, total: projects.length,
      counts: { total: 2, by_lifecycle: { active: 2 }, by_category: { Games: 2 }, needs_review: 0, missing_info: 0, pinned: 0 },
      categories: ["Games"], tags: [], hosts: ["studio"] },
    "/api/agents": [], "/api/sessions": [], "/api/notes": [],
    "/api/conversations": { conversations: [], total: 0, counts: {} },
    "/api/conversations/capabilities": { connector: { id: "c", reachable: false }, providers: {}, pty_fallback: false,
      structured: [], planned: [], unsupported: [], models: [] },
  };
  return { routes, decisions, planted: PLANTED };
}

module.exports = { FIXTURE_ID, PLANTED, buildFixture };
