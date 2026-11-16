// shortcut: localStorage (~5 MB) holds everything; use the JSON backup, move to IndexedDB if it ever fills up.
export const emptyJob = { role: "", company: "", dates: "", bullets: "" };
export const empty = {
  name: "", email: "", phone: "", location: "", links: "", summary: "", skills: "",
  jobs: [emptyJob], projects: "", education: "",
};
export const SECTIONS = ["summary", "skills", "experience", "projects", "education"];
export const TEMPLATES = [["classic", "Classic"], ["modern", "Modern"], ["compact", "Compact"]];
const MAX_VERSIONS = 30;
const KEY = "jobkit2";

export const bullets = (t = "") => t.split("\n").map((l) => l.replace(/^[-•*\s]+/, "").trim()).filter(Boolean);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const copy = (x) => JSON.parse(JSON.stringify(x));

export const clean = (p = {}) => ({
  ...empty, ...p,
  jobs: p.jobs?.length ? p.jobs.map((x) => ({ ...emptyJob, ...x })) : [emptyJob],
});

export const toText = (d, hidden = []) => {
  const on = (s) => !hidden.includes(s);
  return [d.name, d.email, d.phone, d.location, d.links,
    on("summary") && `Summary\n${d.summary}`, on("skills") && `Skills\n${d.skills}`,
    on("experience") && ["Experience", ...d.jobs.flatMap((j) => [j.role, j.company, j.dates, j.bullets])].join("\n"),
    on("projects") && `Projects\n${d.projects}`, on("education") && `Education\n${d.education}`,
  ].filter(Boolean).join("\n");
};

export const newResume = (name, d) => ({ id: uid(), name, template: "classic", hidden: [], d: copy(clean(d)), versions: [] });

export const addVersion = (r, label) => ({
  ...r, versions: [{ at: new Date().toISOString(), label: label || "Saved version", d: copy(r.d) }, ...r.versions].slice(0, MAX_VERSIONS),
});

export function initial(raw, legacy) {
  if (raw) {
    const s = JSON.parse(raw);
    if (s?.profile && s.resumes?.length) return { apps: [], prep: {}, bank: [], mocks: [], ...s };
  }
  const profile = clean(legacy ? JSON.parse(legacy) : {}); // v1 kept one resume under "jobkit"
  const r = newResume("Main resume", profile);
  return { profile, resumes: [r], active: r.id, apps: [], prep: {}, bank: [], mocks: [] };
}

// ---- Application CRM ----
export const STATUSES = [["saved", "Wishlist"], ["applied", "Applied"], ["interview", "Interviewing"], ["offer", "Offer"], ["rejected", "Rejected"], ["withdrawn", "Withdrawn"]];
export const COLUMNS = [["saved", "Wishlist", ["saved"]], ["applied", "Applied", ["applied"]], ["interview", "Interviewing", ["interview"]], ["offer", "Offer", ["offer"]], ["closed", "Closed", ["rejected", "withdrawn"]]];
const CLOSED = ["offer", "rejected", "withdrawn"];

export const today = () => new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD
export const addDays = (d, n) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

export function setStatus(a, status, on = today()) {
  if (a.status === status) return a;
  const n = { ...a, status, history: [...a.history, { at: new Date().toISOString(), text: `Moved to ${status}` }] };
  if (status === "applied") { n.appliedAt ||= on; n.followUpAt ||= addDays(n.appliedAt, 7); }
  if (CLOSED.includes(status) || status === "interview") n.followUpAt = ""; // interviews replace the application follow-up
  return n;
}

export function newApp(f = {}, on = today()) {
  const { status = "saved", ...rest } = f;
  const a = {
    id: uid(), company: "", title: "", url: "", location: "", source: "", desc: "", resumeId: "", salary: "", contact: "", notes: "",
    appliedAt: "", followUpAt: "", interviews: [], ...rest,
    status: "saved", history: [{ at: new Date().toISOString(), text: "Added" }],
  };
  return setStatus(a, status, on);
}

export const followedUp = (a, on = today()) => ({
  ...a, followUpAt: addDays(on, 7), history: [...a.history, { at: new Date().toISOString(), text: "Followed up" }],
});

export function addInterview(a, iv) {
  const n = { ...a, interviews: [...a.interviews, { id: uid(), at: "", round: "", notes: "", ...iv }].sort((x, y) => x.at.localeCompare(y.at)) };
  return ["saved", "applied"].includes(a.status) ? setStatus(n, "interview") : n;
}

export const due = (apps, on = today()) => apps.filter((a) => a.followUpAt && a.followUpAt <= on && !CLOSED.includes(a.status));
export const upcoming = (apps, on = today()) => apps
  .flatMap((a) => a.interviews.filter((i) => i.at && i.at.slice(0, 10) >= on).map((i) => ({ ...i, app: a })))
  .sort((x, y) => x.at.localeCompare(y.at));

export function load() {
  try { return initial(localStorage.getItem(KEY), localStorage.getItem("jobkit")); } catch { return initial(null, null); }
}
export function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch { return false; }
}
