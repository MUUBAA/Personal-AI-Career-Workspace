// Common job model shared by every source, plus dedupe, filters and profile compatibility. Pure: runs on server and client.
import { SKILLS, has, profileYears, titleWords } from "./ats.js";
import { newApp, toText } from "./store.js";

export const INDIA = /india|bangalore|bengaluru|hyderabad|pune|mumbai|chennai|delhi|gurgaon|gurugram|noida|kolkata|ahmedabad|kochi|coimbatore|jaipur|indore|chandigarh|thiruvananthapuram|trivandrum|mysuru|mysore|nagpur|vizag|visakhapatnam|bhubaneswar/i;
const WORLD = /anywhere|worldwide|global|^remote$|^$/i;

export function job(f) {
  const j = {
    id: "", source: "", sources: [], title: "", company: "", location: "", workMode: null, type: null,
    expMin: null, expMax: null, salaryMin: null, salaryMax: null, currency: null, period: null,
    tags: [], posted: null, validThrough: null, url: "", applyUrl: "", desc: "", ...f,
  };
  const text = `${j.title} ${j.location} ${j.desc.slice(0, 1500)}`;
  j.workMode ||= mode(text);
  if (j.expMin == null && j.expMax == null) Object.assign(j, expRange(`${j.title} ${j.desc}`));
  j.sources = j.sources.length ? j.sources : [j.source];
  j.region = INDIA.test(j.location) ? "india" : WORLD.test(j.location.trim()) ? "world" : "abroad";
  j.techs = SKILLS.filter((k) => has(`${j.title} ${j.tags.join(" ")} ${j.desc}`, k)).filter((k, _, a) => !a.some((o) => o !== k && o.includes(k)));
  return j;
}

export function mode(t = "") {
  if (/\bhybrid\b/i.test(t)) return "hybrid";
  if (/\bremote\b|work from home|\bwfh\b|anywhere/i.test(t)) return "remote";
  if (/on-?site|in-?office|work from office|\bwfo\b/i.test(t)) return "onsite";
  return null;
}

export function expRange(t = "") {
  let m = t.match(/(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*(?:years|yrs)/i);
  if (m && +m[1] <= +m[2] && +m[2] < 40) return { expMin: +m[1], expMax: +m[2] };
  m = t.match(/(\d{1,2})\s*\+\s*(?:years|yrs)|(?:minimum|at least|min\.?)\s*(\d{1,2})\s*(?:years|yrs)|(\d{1,2})\s*(?:years|yrs)\s*(?:of\s*)?(?:experience|exp)/i);
  const n = m && +(m[1] || m[2] || m[3]);
  return n && n < 40 ? { expMin: n, expMax: null } : { expMin: null, expMax: null };
}

// shortcut: fixed FX rates for a rough salary filter; plug in a live rate API if precision ever matters
const FX = { INR: 1, USD: 85, EUR: 92, GBP: 108, CAD: 62, AUD: 56, SGD: 64, AED: 23 };
const PER_YEAR = { year: 1, annual: 1, yearly: 1, month: 12, monthly: 12, week: 52, day: 260, hour: 2080 };
export function lpa(j) { // annual salary in lakh INR: [min, max] or null
  const fx = FX[(j.currency || "").toUpperCase()], per = PER_YEAR[(j.period || "year").toLowerCase()];
  if (!fx || !per || (j.salaryMin == null && j.salaryMax == null)) return null;
  const c = (v) => (v == null ? null : Math.round(((v * per * fx) / 1e5) * 10) / 10);
  return [c(j.salaryMin ?? j.salaryMax), c(j.salaryMax ?? j.salaryMin)];
}
export const salaryLabel = (j) => {
  const r = lpa(j);
  if (!r) return "";
  const native = (j.currency || "").toUpperCase() === "INR" ? "" : " (approx.)";
  return r[0] === r[1] ? `₹${r[0]} LPA${native}` : `₹${r[0]}–${r[1]} LPA${native}`;
};

const COMPANY_NOISE = /\b(pvt|private|ltd|limited|inc|llc|llp|technologies|technology|solutions|software|services|india|corp|corporation|co)\b\.?/g;
export const dedupeKey = (j) => `${j.title.toLowerCase().replace(/\(.*?\)|[^a-z0-9 ]/g, " ").replace(/\b(sr|senior)\b/g, "senior").replace(/\s+/g, " ").trim()}|${j.company.toLowerCase().replace(COMPANY_NOISE, "").replace(/[^a-z0-9]/g, "")}`;

// merge listings of the same job from different boards; keeps the richest description and every source
export function dedupe(list) {
  const map = new Map();
  for (const j of list) {
    const k = dedupeKey(j);
    const prev = map.get(k);
    if (!prev) { map.set(k, { ...j, alt: [] }); continue; }
    const best = j.desc.length > prev.desc.length ? { ...j, alt: prev.alt } : prev;
    best.sources = [...new Set([...prev.sources, ...j.sources])];
    best.alt = [...best.alt, ...[prev, j].filter((x) => x.url !== best.url).map((x) => ({ source: x.source, url: x.url }))].filter((x, i, a) => a.findIndex((y) => y.url === x.url) === i);
    for (const f of ["salaryMin", "salaryMax", "currency", "period", "expMin", "expMax", "workMode", "type", "validThrough"]) best[f] ??= prev[f] ?? j[f];
    map.set(k, best);
  }
  return [...map.values()];
}

// deterministic fit against the master profile: 60 skills + 20 title + 20 experience
export function compat(j, { profileText, roles = [], years = 0 }) {
  const want = j.techs;
  const missing = want.filter((k) => !has(profileText, k));
  const skill = want.length ? (want.length - missing.length) / want.length : 0.5;
  const tw = titleWords(j.title).filter((w) => !["developer", "and", "&", "with", "for"].includes(w));
  const title = tw.length ? Math.max(0, ...roles.map((r) => { const g = titleWords(r); return tw.filter((w) => g.includes(w)).length / tw.length; })) : 0.5;
  let exp = 0.7; // unknown requirement
  if (j.expMin != null) exp = years >= j.expMin ? (j.expMax != null && years > j.expMax + 2 ? 0.7 : 1) : years >= j.expMin - 1 ? 0.6 : 0.2;
  return { pct: Math.round(skill * 60 + Math.min(1, title) * 20 + exp * 20), missing, skill: Math.round(skill * 100), title: Math.round(Math.min(1, title) * 100), exp };
}

export const DAY = 864e5;
export function filterJobs(list, f, now = Date.now()) {
  const inc = (v, q) => !q.trim() || (v || "").toLowerCase().includes(q.trim().toLowerCase());
  return list.filter((j) => {
    if (!inc(j.title, f.title || "") || !inc(j.company, f.company || "") || !inc(j.location, f.location || "")) return false;
    if (f.region && f.region !== "all" && j.region !== f.region && !(f.region === "india" && j.region === "world")) return false;
    if (f.modes?.length && !f.modes.includes(j.workMode)) return false;
    if (f.types?.length && !f.types.includes(j.type)) return false;
    const me = f.myYears === "" || f.myYears == null ? null : +f.myYears;
    if (me != null && j.expMin != null && (me < j.expMin - 1 || (j.expMax != null && me > j.expMax + 3))) return false;
    if (f.minLpa) { const s = lpa(j); if (!s || s[1] < +f.minLpa) return false; }
    if (f.techs?.length && !f.techs.every((k) => j.techs.includes(k))) return false;
    if (f.days && (!j.posted || now - Date.parse(j.posted) > f.days * DAY)) return false;
    if (f.hideExpired && j.validThrough && Date.parse(j.validThrough) < now) return false;
    return true;
  });
}

export const ago = (d, now = Date.now()) => {
  if (!d) return "";
  const n = Math.floor((now - Date.parse(d)) / DAY);
  return n <= 0 ? "today" : n === 1 ? "1 day ago" : n < 30 ? `${n} days ago` : `${Math.floor(n / 30)} mo ago`;
};

// public career boards verified to respond (Nov 2026); edit in the Jobs tab
export const PRESET_BOARDS = [
  { type: "greenhouse", slug: "razorpaysoftwareprivatelimited", name: "Razorpay" },
  { type: "greenhouse", slug: "groww", name: "Groww" },
  { type: "greenhouse", slug: "druva", name: "Druva" },
  { type: "lever", slug: "cred", name: "CRED" },
  { type: "lever", slug: "zeta", name: "Zeta" },
  { type: "lever", slug: "paytm", name: "Paytm" },
  { type: "lever", slug: "meesho", name: "Meesho" },
  { type: "ashby", slug: "atlan", name: "Atlan" },
  { type: "ashby", slug: "sarvam", name: "Sarvam AI" },
];

export const profileContext = (s) => ({
  profileText: toText(s.profile),
  roles: [...s.resumes.map((x) => x.name), ...s.profile.jobs.map((j) => j.role)].filter(Boolean),
  years: profileYears(s.profile),
});

// a wishlist entry (Applications, status saved) built from a search result
export const appFromJob = (j, resumeId) => newApp({
  company: j.company, title: j.title, url: j.url, location: j.location, source: j.sources.join(", "), salary: salaryLabel(j), desc: j.desc.slice(0, 5000), resumeId,
  job: { sources: j.sources, workMode: j.workMode, type: j.type, expMin: j.expMin, expMax: j.expMax, posted: j.posted, validThrough: j.validThrough, techs: j.techs, fit: j.fit?.pct ?? null, alt: j.alt || [] },
});
