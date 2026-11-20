// Career agent: the AI may only REQUEST these controlled functions. The app validates every call here, runs read-only
// ones itself, and asks you before any action that changes data or navigates.
import { SKILLS, analyze, dropContained, has, isFiller } from "./ats.js";
import { INDIA } from "./jobs.js";
import { bullets, toText } from "./store.js";

const S = (description, extra = {}) => ({ type: "string", description, ...extra });
const N = (description, minimum, maximum) => ({ type: "number", description, minimum, maximum });
const fn = (name, description, properties = {}, required = []) => ({ type: "function", function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } } });

export const TOOLS = [
  fn("search_jobs", "Search live job boards and score each job against the user's master profile (0-100). Returns refs like J1 for later actions.", {
    keywords: S("Comma-separated short search terms, e.g. 'react,full stack' or '.net,c#'. Omit to use the user's main skills."),
    min_match: N("Only return jobs with at least this compatibility %", 0, 100),
    region: S("Where", { enum: ["any", "india", "abroad"] }),
    work_mode: S("Work mode", { enum: ["any", "remote", "hybrid", "onsite"] }),
    limit: N("Max jobs to return (default 10)", 1, 25),
  }),
  fn("list_applications", "List the user's tracked applications (wishlist, applied, interviewing, offers). Returns refs like A1.", {
    status: S("Filter by status", { enum: ["any", "saved", "applied", "interview", "offer", "rejected", "withdrawn"] }),
    needs_follow_up: { type: "boolean", description: "Only applications whose follow-up date is today or earlier" },
    upcoming_interviews: { type: "boolean", description: "Only applications with interviews scheduled from today on" },
  }),
  fn("get_profile_summary", "The user's name, years of experience, skills, job titles and resume names."),
  fn("skill_gaps", "Rank the technical skills most often required by the user's saved/applied jobs and recent search results that are missing from the master profile.", {
    top: N("How many gaps (default 5)", 1, 15),
  }),
  fn("compare_resume_versions", "Compare the most recent saved versions of a resume: summary, skills and bullet changes plus a rule-based ATS quality score for each.", {
    resume: S("Resume name (default: the active resume)"), count: N("How many recent versions (default 3)", 2, 6),
  }),
  fn("ats_check", "Rule-based ATS score of a resume against a job's description.", {
    job_ref: S("A job ref (J…) or application ref (A…)"), resume: S("Resume name (default: active resume)"),
  }, ["job_ref"]),
  fn("draft_email", "Draft (not send) a follow-up, thank-you or status-check email for an application.", {
    app_ref: S("Application ref A…"), kind: S("Email type", { enum: ["followup", "thankyou", "status"] }),
  }, ["app_ref", "kind"]),
  fn("save_to_wishlist", "Save a job from search results to the user's wishlist. Needs the user's approval.", { job_ref: S("Job ref J…") }, ["job_ref"]),
  fn("mark_followed_up", "Record that the user followed up on an application (next follow-up in 7 days). Needs approval.", { app_ref: S("Application ref A…") }, ["app_ref"]),
  fn("open_tailoring", "Open the Tailor tab for a job so the user can review AI suggestions in Approval Mode. Needs approval.", {
    job_ref: S("Job ref J… or application ref A…"), resume: S("Resume name to tailor (default: active resume)"),
  }, ["job_ref"]),
  fn("open_interview_prep", "Open interview preparation for an application. Needs approval.", { app_ref: S("Application ref A…") }, ["app_ref"]),
];
export const NEEDS_APPROVAL = new Set(["save_to_wishlist", "mark_followed_up", "open_tailoring", "open_interview_prep"]);

// strict schema check: known tool, known args, right types/enums/ranges, refs that exist in this session
export function validateCall(name, rawArgs, refs = {}) {
  const def = TOOLS.find((t) => t.function.name === name)?.function;
  if (!def) return { ok: false, error: `Unknown tool ${name}` };
  let args;
  try { args = rawArgs ? (typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs) : {}; } catch { return { ok: false, error: "Arguments are not valid JSON" }; }
  if (typeof args !== "object" || Array.isArray(args) || args === null) return { ok: false, error: "Arguments must be an object" };
  const props = def.parameters.properties;
  for (const k of Object.keys(args)) if (!props[k]) return { ok: false, error: `Unknown argument ${k}` };
  for (const k of def.parameters.required) if (args[k] === undefined || args[k] === "") return { ok: false, error: `Missing ${k}` };
  for (const [k, v] of Object.entries(args)) {
    const p = props[k];
    if (v === null) { delete args[k]; continue; }
    if (p.type === "number" && (typeof v !== "number" || !isFinite(v) || v < p.minimum || v > p.maximum)) return { ok: false, error: `${k} must be a number from ${p.minimum} to ${p.maximum}` };
    if (p.type === "string" && (typeof v !== "string" || v.length > 200)) return { ok: false, error: `${k} must be a short string` };
    if (p.type === "boolean" && typeof v !== "boolean") return { ok: false, error: `${k} must be true or false` };
    if (p.enum && !p.enum.includes(v)) return { ok: false, error: `${k} must be one of ${p.enum.join(", ")}` };
  }
  for (const k of ["job_ref", "app_ref"]) {
    if (args[k] === undefined) continue;
    const ref = String(args[k]).trim().toUpperCase();
    const okPrefix = k === "app_ref" ? /^A\d+$/ : /^[JA]\d+$/;
    if (!okPrefix.test(ref)) return { ok: false, error: `${k} must look like ${k === "app_ref" ? "A1" : "J1 or A1"}` };
    if (!refs[ref]) return { ok: false, error: `${ref} is not known yet. Call ${ref[0] === "J" ? "search_jobs" : "list_applications"} first.` };
    args[k] = ref;
  }
  return { ok: true, args };
}

const skillsOf = (t = "") => dropContained(SKILLS.filter((k) => has(t, k)));

// Tools outside the SKILLS dictionary (Snowflake, Airflow, dbt…): proper-noun-looking terms that are never written in lowercase in the job text.
// shortcut: a first word on a line is skipped (it is capitalised anyway), so a tool that only ever starts a bullet is missed; add a vocabulary if that matters.
const NAMEY = /(?<![A-Za-z0-9])(?:[A-Z][a-z]+[A-Z][A-Za-z0-9]*|[A-Z][a-z]{3,}|[A-Z]{2,6}|[A-Za-z]+\.js|[A-Z][A-Za-z]*(?:#|\+\+))(?![A-Za-z0-9])/g;
const NOT_TOOLS = new Set("monday tuesday wednesday thursday friday saturday sunday january february march april june july august september october november december remote hybrid onsite full time part contract permanent india global team".split(" "));
function toolsIn(j) {
  const text = `${j.title} ${j.desc || ""}`;
  const written = new Set(text.split(/[^A-Za-z0-9.#+]+/));
  const own = `${j.title} ${j.company}`.toLowerCase();
  const out = new Map();
  for (const m of text.replace(/^[\s\-•*·\d.)]*\S+/gm, " ").match(NAMEY) || []) {
    const lc = m.toLowerCase();
    if (out.has(lc) || written.has(lc) || NOT_TOOLS.has(lc) || isFiller(lc) || own.includes(lc) || INDIA.test(lc) || SKILLS.some((k) => has(m, k))) continue;
    out.set(lc, m);
  }
  return out;
}

// deterministic: most frequent skills missing from the profile across the given jobs. Dictionary skills count from one job; other tools need 2+ jobs.
export function skillGaps(profile, jobs, top = 5) {
  const pt = toText(profile), ptl = pt.toLowerCase();
  const count = new Map();
  const add = (key, skill, j, inferred) => {
    const c = count.get(key) || { skill, jobs: 0, examples: [], ...(inferred && { inferred: true }) };
    c.jobs++; if (c.examples.length < 3) c.examples.push(`${j.title} @ ${j.company}`);
    count.set(key, c);
  };
  for (const j of jobs) {
    for (const k of skillsOf(`${j.title} ${j.desc || ""}`)) if (!has(pt, k)) add(k, k, j, false);
    for (const [lc, m] of toolsIn(j)) if (!ptl.includes(lc)) add(`~${lc}`, m, j, true);
  }
  const gaps = [...count.values()].filter((c) => !c.inferred || c.jobs >= 2).sort((a, b) => b.jobs - a.jobs);
  return { analysed_jobs: jobs.length, gaps: gaps.slice(0, top).map((c) => ({ ...c, share: `${Math.round((c.jobs / Math.max(1, jobs.length)) * 100)}%` })) };
}

// deterministic diff of the last N versions (newest first) of a resume, plus the current draft
export function compareVersions(resume, count = 3) {
  const snaps = [{ label: "Current (unsaved edits included)", at: null, d: resume.d }, ...resume.versions.slice(0, count - 1)].slice(0, count);
  if (resume.versions.length === 0) return { error: `“${resume.name}” has no saved versions yet. Save one in the Resumes tab.` };
  const skills = (d) => d.skills.split(",").map((x) => x.trim()).filter(Boolean);
  const blts = (d) => new Set([...d.jobs.flatMap((j) => bullets(j.bullets)), ...bullets(d.projects)].map((b) => b.toLowerCase()));
  const out = snaps.map((v) => ({ version: v.label, saved: v.at, ats_general: analyze({ d: v.d, hidden: resume.hidden }).total, words: toText(v.d).split(/\s+/).length, skills: skills(v.d).length, bullets: blts(v.d).size }));
  const changes = snaps.slice(0, -1).map((newer, i) => {
    const older = snaps[i + 1];
    const sNew = skills(newer.d), sOld = skills(older.d);
    const bNew = blts(newer.d), bOld = blts(older.d);
    return {
      from: older.label, to: newer.label,
      summary_changed: newer.d.summary.trim() !== older.d.summary.trim(),
      skills_added: sNew.filter((x) => !sOld.some((y) => y.toLowerCase() === x.toLowerCase())),
      skills_removed: sOld.filter((x) => !sNew.some((y) => y.toLowerCase() === x.toLowerCase())),
      bullets_added: [...bNew].filter((b) => !bOld.has(b)).slice(0, 6),
      bullets_removed: [...bOld].filter((b) => !bNew.has(b)).slice(0, 6),
    };
  });
  return { resume: resume.name, versions: out, changes };
}

export const SYSTEM = (today) => `You are JobKit's career agent for one job seeker in India (today is ${today}).
You act ONLY through the provided tools. Rules:
- ALWAYS call a tool before answering anything about the user's jobs, applications, interviews, resumes or skills, even if you think you know. Never invent jobs, companies, scores, skills, dates or numbers. If a tool returns nothing, say so.
- Typical mappings: upcoming interview -> list_applications(upcoming_interviews: true) then open_interview_prep;
  follow-ups -> list_applications(needs_follow_up: true); tailored resume for a job -> open_tailoring;
  compatibility above X% -> search_jobs(min_match: X+1); skill gaps -> skill_gaps; resume versions -> compare_resume_versions.
- Refer to items by their refs (J3, A2) and include job links from tool results as markdown links.
- Compatibility, ATS and skill-gap numbers come from the app's rule engine; report them as given.
- For actions (save_to_wishlist, mark_followed_up, open_tailoring, open_interview_prep) just call the tool: the app asks the user to approve. Never claim an action happened unless the tool result says done.
- Never suggest adding skills the user doesn't have to a resume; suggest learning them instead.
- Be concise: short bullet lists (no tables), no long preambles.`;
