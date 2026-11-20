// Tailoring engine. Deterministic parts decide what is allowed; the AI only proposes wording, and every proposal
// passes the guardrails here before you can accept it. Nothing touches the original resume.
import { SKILLS, findTerm, has, kwHas } from "./ats.js";
import { toText } from "./store.js";

const YEAR = /\b(19|20)\d{2}\b/g;
const clean = (l) => l.replace(/^[-•*\s]+/, "").trim();
const norm = (l) => clean(l).toLowerCase().replace(/\s+/g, " ");
const nums = (t = "") => t.replace(YEAR, "").replace(/\[[^\]]*\]/g, "").match(/\d+(\.\d+)?/g) || [];

// steps 3–4: which job keywords you have in this resume, only in your master profile, or nowhere (genuine gap)
export function gapReport(info, d, profile) {
  const rt = toText(d), pt = toText(profile);
  const kws = [...info.required.map((k) => ({ k, req: true })), ...info.preferred.map((k) => ({ k, req: false }))];
  return {
    inResume: kws.filter((x) => kwHas(rt, x.k)),
    inProfile: kws.filter((x) => !kwHas(rt, x.k) && kwHas(pt, x.k)),
    gaps: kws.filter((x) => !kwHas(rt, x.k) && !kwHas(pt, x.k)),
  };
}

const sameJob = (a, b) => `${a.company}|${a.role}`.toLowerCase().trim() === `${b.company}|${b.role}`.toLowerCase().trim();

// numbered items the AI may rewrite, plus master-profile bullets missing from this resume that it may pick (verbatim)
export function items(d, profile) {
  const list = [];
  d.jobs.forEach((j, i) => j.bullets.split("\n").forEach((l, n) => clean(l) && list.push({ id: `j${i}b${n}`, kind: "bullet", job: i, text: clean(l), where: j.role || j.company })));
  d.projects.split("\n").forEach((l, n) => clean(l) && list.push({ id: `p${n}`, kind: "project", text: clean(l), where: "Projects" }));
  const extra = [];
  d.jobs.forEach((j, i) => {
    const m = profile.jobs.find((pj) => sameJob(pj, j));
    if (!m) return;
    const have = new Set(j.bullets.split("\n").map(norm));
    m.bullets.split("\n").map(clean).filter((b) => b && !have.has(norm(b))).forEach((text) => extra.push({ id: `m${extra.length}`, kind: "add", job: i, text, where: j.role || j.company }));
  });
  return { list, extra };
}

// guardrail: block new skills or numbers you don't have; warn when a skill comes from elsewhere in your profile
export function check(before, after, { profile, jobText, gaps = [] }) {
  const pt = toText(profile);
  const added = SKILLS.filter((k) => has(after, k) && !has(before, k));
  const fake = added.filter((k) => !has(pt, k));
  const gapHit = gaps.filter((k) => has(after, k) && !has(before, k));
  const newNums = nums(after).filter((x) => !nums(before).includes(x) && !nums(jobText || pt).includes(x));
  if (fake.length || gapHit.length) return { status: "blocked", note: `Adds skills not in your profile: ${[...new Set([...fake, ...gapHit])].join(", ")}` };
  if (newNums.length) return { status: "blocked", note: `Adds numbers you never wrote: ${newNums.join(", ")}` };
  const elsewhere = jobText ? added.filter((k) => !has(jobText, k)) : [];
  if (elsewhere.length) return { status: "warn", note: `Uses ${elsewhere.join(", ")} from elsewhere in your profile. Accept only if you used it in this job.` };
  return { status: "ok", note: added.length ? `Adds ${added.join(", ")} (found in your profile)` : "" };
}

// deterministic skills line: job-relevant skills first, then job keywords proven by your master profile
export function skillsSuggestion(d, info, profile) {
  const pt = toText(profile);
  const kws = [...info.required, ...info.preferred];
  const cur = d.skills.split(",").map((x) => x.trim()).filter(Boolean);
  const rel = (x) => kws.some((k) => has(x, k));
  const sorted = [...cur.filter(rel), ...cur.filter((x) => !rel(x))];
  const add = kws.filter((k) => !has(d.skills, k) && has(pt, k)).map((k) => findTerm(pt, k) || k);
  const after = [...new Set([...sorted, ...add])].join(", ");
  if (after === cur.join(", ")) return null;
  return {
    id: "skills", kind: "skills", where: "Skills", before: d.skills, after,
    reason: `${sorted.some((x, i) => x !== cur[i]) ? "Moves job-relevant skills first. " : ""}${add.length ? `Adds ${add.join(", ")} from your master profile.` : ""}`.trim(),
    check: { status: "ok", note: "" },
  };
}

// turn AI output into reviewable suggestions, each guarded
export function buildSuggestions(ai, d, profile, info, gapKeys) {
  const { list, extra } = items(d, profile);
  const byId = Object.fromEntries([...list, ...extra].map((x) => [x.id, x]));
  const jobText = (i) => { const m = profile.jobs.find((pj) => sameJob(pj, d.jobs[i])); return m ? `${m.role} ${m.bullets}` : ""; };
  const out = [];
  if (ai?.summary?.after && ai.summary.after.trim() !== d.summary.trim()) {
    out.push({ id: "summary", kind: "summary", where: "Summary", before: d.summary, after: ai.summary.after.trim(), reason: ai.summary.reason || "",
      check: check(d.summary, ai.summary.after, { profile, jobText: `${toText(profile)}`, gaps: gapKeys }) });
  }
  const sk = skillsSuggestion(d, info, profile);
  if (sk) out.push(sk);
  for (const b of Array.isArray(ai?.bullets) ? ai.bullets : []) {
    const it = byId[b.id];
    if (!it || it.kind === "add" || !b.after?.trim() || norm(b.after) === norm(it.text)) continue;
    const after = clean(b.after);
    out.push({ id: it.id, kind: it.kind, job: it.job, where: it.where, before: it.text, after, reason: b.reason || "",
      check: check(it.text, after, { profile, jobText: it.kind === "bullet" ? jobText(it.job) : "", gaps: gapKeys }) });
  }
  for (const a of Array.isArray(ai?.add) ? ai.add : []) {
    const it = byId[a.id];
    if (it?.kind === "add" && !out.some((o) => o.id === it.id)) out.push({ ...it, before: "", after: it.text, reason: a.reason || "From your master profile", check: { status: "ok", note: "Copied word-for-word from your master profile" } });
  }
  return out;
}

// step 8: apply accepted suggestions to a COPY of the resume
export function apply(d, accepted) {
  const n = JSON.parse(JSON.stringify(d));
  for (const s of accepted) {
    if (s.kind === "summary") n.summary = s.after;
    else if (s.kind === "skills") n.skills = s.after;
    else if (s.kind === "bullet") {
      const [, i, k] = s.id.match(/^j(\d+)b(\d+)$/);
      const lines = n.jobs[i].bullets.split("\n"); lines[k] = s.after; n.jobs[i].bullets = lines.join("\n");
    } else if (s.kind === "project") {
      const k = +s.id.slice(1); const lines = n.projects.split("\n"); lines[k] = s.after; n.projects = lines.join("\n");
    } else if (s.kind === "add") n.jobs[s.job].bullets = `${n.jobs[s.job].bullets.trimEnd()}\n${s.after}`.trim();
  }
  return n;
}
