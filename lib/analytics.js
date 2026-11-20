// Career analytics: everything is computed from local data with the rule engines; nothing here calls the AI.
import { analyze } from "./ats.js";
import { skillGaps } from "./agent.js";

const MAX_DISCOVERED = 5000;

// first-seen date per job key, so the same job found in five searches counts once
export function recordDiscovered(prev = {}, jobs = [], on = new Date().toLocaleDateString("en-CA"), keyOf = (j) => j.id) {
  const next = { ...prev };
  for (const j of jobs) { const k = keyOf(j); if (k && !next[k]) next[k] = on; }
  const keys = Object.keys(next);
  if (keys.length <= MAX_DISCOVERED) return next;
  // keep the newest entries
  return Object.fromEntries(keys.sort((a, b) => next[b].localeCompare(next[a])).slice(0, MAX_DISCOVERED).map((k) => [k, next[k]]));
}

const moved = (a, to) => a.history?.some((h) => h.text === `Moved to ${to}`);
export const submitted = (a) => !!a.appliedAt || ["applied", "interview", "offer"].includes(a.status) || a.interviews?.length > 0;
export const interviewed = (a) => a.interviews?.length > 0 || ["interview", "offer"].includes(a.status) || moved(a, "interview") || moved(a, "offer");
export const offered = (a) => a.status === "offer" || moved(a, "offer");

// Monday of the local week, as YYYY-MM-DD
export function weekOf(iso) {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toLocaleDateString("en-CA");
}
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const avg = (xs) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
// history timestamps are UTC; bucket by the local day so an app added at 1 AM IST lands in the right week
const addedOn = (a) => (a.history?.[0]?.at ? new Date(a.history[0].at).toLocaleDateString("en-CA") : "");

export function analytics(s, { now = new Date(), weeks = 12 } = {}) {
  const apps = s.apps || [];
  const discovered = s.discovered || {};
  const sub = apps.filter(submitted), ivs = apps.filter(interviewed), offs = apps.filter(offered);
  const rejected = sub.filter((a) => a.status === "rejected").length;

  // ATS of the resume actually sent, against that job's description (rule-based)
  const resumeOf = (a) => s.resumes?.find((r) => r.id === a.resumeId);
  const scored = sub.map((a) => {
    const r = resumeOf(a);
    return { a, r, ats: r && a.desc?.trim() ? analyze({ d: r.d, hidden: r.hidden, resumeName: r.name, jd: a.desc }).total : null };
  });
  const withAts = scored.filter((x) => x.ats !== null);

  const byResume = Object.values(scored.reduce((m, x) => {
    const k = x.r?.id || "none";
    m[k] ||= { name: x.r?.name || "No resume linked", submitted: 0, interviews: 0, ats: [] };
    m[k].submitted++; if (interviewed(x.a)) m[k].interviews++; if (x.ats !== null) m[k].ats.push(x.ats);
    return m;
  }, {})).map(({ ats, ...r }) => ({ ...r, conv: pct(r.interviews, r.submitted), avgAts: avg(ats) })).sort((a, b) => b.submitted - a.submitted);

  // weekly buckets, oldest first
  const start = new Date(`${weekOf(now.toLocaleDateString("en-CA"))}T00:00:00`);
  const wk = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(start); d.setDate(d.getDate() - 7 * (weeks - 1 - i));
    return { week: d.toLocaleDateString("en-CA"), discovered: 0, saved: 0, applied: 0, interviews: 0 };
  });
  const bump = (date, k) => { if (!date) return; const w = wk.find((x) => x.week === weekOf(date)); if (w) w[k]++; };
  for (const d of Object.values(discovered)) bump(d, "discovered");
  for (const a of apps) {
    bump(addedOn(a), "saved");
    bump(a.appliedAt, "applied");
    for (const i of a.interviews || []) bump(i.at, "interviews");
  }

  const companies = Object.values(sub.reduce((m, a) => {
    const k = (a.company || "Unknown").trim().toLowerCase();
    m[k] ||= { company: a.company || "Unknown", applications: 0, interviews: 0, status: a.status };
    m[k].applications++; if (interviewed(a)) m[k].interviews++;
    return m;
  }, {})).sort((a, b) => b.applications - a.applications);

  const jobsWithDesc = apps.filter((a) => a.desc?.trim()).map((a) => ({ title: a.title, company: a.company, desc: a.desc }));
  const gaps = s.profile && jobsWithDesc.length ? skillGaps(s.profile, jobsWithDesc, 8).gaps : [];

  const hi = withAts.filter((x) => x.ats >= 70), lo = withAts.filter((x) => x.ats < 70);
  const insights = [];
  if (hi.length >= 2 && lo.length >= 2) {
    const h = pct(hi.filter((x) => interviewed(x.a)).length, hi.length), l = pct(lo.filter((x) => interviewed(x.a)).length, lo.length);
    insights.push(`Applications sent with ATS 70+ got interviews ${h}% of the time, vs ${l}% below 70.`);
  }
  const best = byResume.filter((r) => r.submitted >= 3 && r.name !== "No resume linked").sort((a, b) => b.conv - a.conv)[0];
  if (best && byResume.filter((r) => r.submitted >= 3).length > 1) insights.push(`“${best.name}” converts best: ${best.conv}% of its ${best.submitted} applications reached interview.`);
  if (sub.length >= 5 && ivs.length === 0) insights.push("5+ applications and no interviews yet: tailor each resume to the job and aim for ATS 70+ before applying.");
  if (gaps[0]) insights.push(`Most-missing skill across your tracked jobs: ${gaps[0].skill} (${gaps[0].share} of them).`);

  return {
    kpis: {
      discovered: Object.keys(discovered).length, saved: apps.length, submitted: sub.length, interviews: ivs.length, offers: offs.length,
      rejectionPct: pct(rejected, sub.length), interviewConv: pct(ivs.length, sub.length), offerConv: pct(offs.length, ivs.length),
    },
    ats: { avg: avg(withAts.map((x) => x.ats)), n: withAts.length, interviewedAvg: avg(withAts.filter((x) => interviewed(x.a)).map((x) => x.ats)), othersAvg: avg(withAts.filter((x) => !interviewed(x.a)).map((x) => x.ats)) },
    byResume, weeks: wk, companies, gaps, insights,
  };
}
