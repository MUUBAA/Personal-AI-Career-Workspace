// JobKit ATS engine: deterministic rules decide every score. AI may only supply the JD keyword lists (evidence),
// never a number. Weights are JobKit's own heuristic, not a universal ATS standard.
import { bullets } from "./store.js";

export const SKILLS = [
  "c#", ".net", ".net core", "asp.net", "asp.net core", "web api", "mvc", "entity framework", "linq", "ado.net", "dapper", "blazor", "signalr",
  "sql server", "microservices", "javascript", "typescript", "node.js", "express", "nestjs", "react", "redux", "next.js", "angular", "vue",
  "html", "css", "tailwind", "bootstrap", "jquery", "material ui", "rest api", "graphql", "grpc", "websocket",
  "mongodb", "postgresql", "mysql", "redis", "elasticsearch", "kafka", "rabbitmq", "firebase", "supabase",
  "azure", "aws", "gcp", "docker", "kubernetes", "ci/cd", "git", "github actions", "azure devops", "jenkins", "terraform", "linux", "nginx",
  "python", "fastapi", "django", "flask", "java", "spring boot", "php", "laravel",
  "llm", "rag", "langchain", "langgraph", "llamaindex", "semantic kernel", "crewai", "autogen", "openai", "claude", "prompt engineering",
  "vector database", "embeddings", "agentic ai", "ai agents", "mcp", "fine-tuning", "machine learning", "deep learning", "nlp", "pytorch", "tensorflow", "hugging face",
  "unit testing", "integration testing", "xunit", "nunit", "jest", "cypress", "playwright", "selenium",
  "agile", "scrum", "system design", "design patterns", "oop", "data structures", "oauth", "jwt", "swagger", "postman", "power bi",
];

const ALIASES = {
  "node.js": ["nodejs", "node js", "node"], ".net": ["dotnet", ".net core", "asp.net", ".net framework"], ".net core": ["dotnet core", "asp.net core", ".net 6", ".net 7", ".net 8", ".net 9"],
  "asp.net core": ["asp.net core"], react: ["react.js", "reactjs"], "next.js": ["nextjs", "next js"], vue: ["vue.js", "vuejs"], angular: ["angularjs"],
  express: ["express.js", "expressjs"], javascript: ["js", "es6"], "ci/cd": ["ci cd", "cicd", "continuous integration", "continuous deployment", "ci pipeline", "ci pipelines", "cd pipelines", "github actions", "gitlab ci", "jenkins", "azure devops"],
  postgresql: ["postgres"], kubernetes: ["k8s"], aws: ["amazon web services"], azure: ["microsoft azure"], gcp: ["google cloud"],
  "rest api": ["restful", "rest apis", "rest services", "restful apis", "web api"], "unit testing": ["unit tests", "unit test", "xunit", "nunit", "jest", "tdd"],
  llm: ["llms", "large language model", "large language models", "gpt"], "vector database": ["vector db", "vector store", "pinecone", "chromadb", "qdrant", "weaviate", "pgvector"],
  "sql server": ["mssql", "ms sql", "t-sql"], "c#": ["csharp"], "entity framework": ["ef core", "entity framework core"], mongodb: ["mongo"],
  "ai agents": ["ai agent", "agentic"], "agentic ai": ["agentic", "ai agents"], "machine learning": ["ml models"], "hugging face": ["huggingface"],
  "material ui": ["mui"], "oop": ["object oriented", "object-oriented"], "websocket": ["websockets", "socket.io", "signalr"],
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const hit = (text, k) => new RegExp(`(^|[^a-z0-9.])${esc(k)}($|[^a-z0-9])`, "i").test(text); // "." before: so "js" doesn't match inside "Node.js"
export const has = (text, k) => [k, ...(ALIASES[k] || [])].some((v) => hit(text, v));
// the spelling the user actually wrote for keyword k (e.g. "Node.js" for "node.js"), or null
export function findTerm(text = "", k) {
  for (const v of [k, ...(ALIASES[k] || [])]) {
    const m = text.match(new RegExp(`(?:^|[^a-z0-9])(${esc(v)})(?=$|[^a-z0-9])`, "i"));
    if (m) return m[1];
  }
  return null;
}
const dropContained =(list) => list.filter((k) => !list.some((o) => o !== k && o.includes(k)));

// ---------- simple Jobs-tab match (unchanged behaviour) ----------
export function jobMatch(resume, jobText) {
  const wanted = dropContained(SKILLS.filter((k) => has(jobText, k)));
  if (!wanted.length) return null;
  const missing = wanted.filter((k) => !has(resume, k));
  return { pct: Math.round(((wanted.length - missing.length) / wanted.length) * 100), missing };
}

// ---------- JD keyword extraction without AI ----------
const PREF = /prefer|nice to have|good to have|bonus|\bplus\b|desirable|added advantage|optional/i;
const REQ_HEAD = /required|must have|requirements|qualifications|mandatory|what you.?ll need/i;

export function extractJd(jd = "") {
  const req = new Set(), pref = new Set();
  let prefSection = false;
  for (const line of jd.split(/\n+/)) {
    if (PREF.test(line) && line.length < 60) prefSection = true;
    else if (REQ_HEAD.test(line) && line.length < 60) prefSection = false;
    for (const k of SKILLS) if (has(line, k)) (prefSection || PREF.test(line) ? pref : req).add(k);
  }
  const required = dropContained([...req]);
  const preferred = dropContained([...pref].filter((k) => !req.has(k)));
  const first = jd.split("\n").map((l) => l.trim()).find(Boolean) || "";
  const titled = jd.match(/(?:job title|position|designation)\s*[:\-–]\s*([^\n]{3,60})/i); // not "role:", which often starts prose ("About the role: We are…")
  const yrs = jd.match(/(\d{1,2})\s*\+?\s*(?:[-–to]+\s*\d{1,2}\s*)?(?:years|yrs)/i);
  return {
    title: titled ? titled[1].trim() : first.split(/\s+/).length <= 8 && !/[:.]$/.test(first) ? first : "",
    required, preferred, minYears: yrs ? Number(yrs[1]) : null, source: "rules",
  };
}

// merge AI lists with the rule-based floor so a flaky AI answer can't drop dictionary skills
export function mergeJd(rules, ai) {
  if (!ai) return rules;
  // degrees are judged by the Education category, not as literal keywords (B.E. is a bachelor's)
  const DEG = /degree|bachelor|master|graduat|b\.?\s?tech|\bb\.?\s?e\b|m\.?\s?tech|\bmca\b|\bbca\b|diploma/i;
  const norm = (a) => [...new Set((Array.isArray(a) ? a : []).map((x) => String(x).toLowerCase().trim()).filter((x) => x && x.length < 40 && !DEG.test(x)))].slice(0, 25);
  const aiReq = norm(ai.required), aiPref = norm(ai.preferred);
  const required = dropContained([...new Set([...aiReq, ...rules.required.filter((k) => !aiPref.some((p) => has(p, k)))])]);
  const preferred = dropContained([...new Set([...aiPref, ...rules.preferred])].filter((k) => !required.includes(k)));
  const y = Number(ai.min_years);
  return { title: (ai.title || rules.title || "").trim(), required, preferred, minYears: y > 0 && y < 40 ? y : rules.minYears, source: "ai" };
}

// ---------- dates ----------
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const nowYM = (d = new Date()) => d.getFullYear() * 12 + d.getMonth();

function point(s, isEnd, now) {
  s = s.trim().toLowerCase().replace(/\.$/, "");
  if (/^(present|current|now|till date|to date|ongoing|today)$/.test(s)) return { ym: now, fmt: "present" };
  let m = s.match(/^([a-z]{3,9})\.?,?\s*'?(\d{4}|\d{2})$/);
  if (m && MON[m[1].slice(0, 3)]) {
    const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return { ym: y * 12 + MON[m[1].slice(0, 3)] - 1, fmt: m[2].length === 2 ? "mon yy" : "mon yyyy" };
  }
  m = s.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return { ym: +m[2] * 12 + +m[1] - 1, fmt: "mm/yyyy" };
  m = s.match(/^(\d{4})$/);
  if (m) return { ym: isEnd ? Math.min(+m[1] * 12 + 11, Math.max(now, +m[1] * 12)) : +m[1] * 12, fmt: "yyyy" };
  return null;
}

export function parseRange(str = "", now = nowYM()) {
  const s = str.trim();
  if (!s) return { ok: false, empty: true };
  const m = s.match(/^(\d{4})\s*-\s*(\d{4}|present|current)$/i);
  let parts = m ? [m[1], m[2]] : s.split(/\s+(?:–|—|-|to|till)\s+|\s*[–—]\s*/i);
  if (parts.length === 1) parts = (s.match(/^(.+?\d)\s*-\s*(\S.*)$/) || []).slice(1); // "01/2022-06/2023"
  if (parts.length !== 2) return { ok: false };
  const a = point(parts[0], false, now), b = point(parts[1], true, now);
  if (!a || !b) return { ok: false };
  return { ok: true, start: a.ym, end: b.ym, fmts: [a.fmt, b.fmt].filter((f) => f !== "present") };
}

export const profileYears = (d, now = nowYM()) => totalYears(d.jobs.map((j) => parseRange(j.dates, now)));

function totalYears(ranges) {
  const r = ranges.filter((x) => x.ok && x.end >= x.start).map((x) => [x.start, x.end]).sort((a, b) => a[0] - b[0]);
  let months = 0, cur = null;
  for (const [s, e] of r) {
    if (!cur || s > cur[1] + 1) { if (cur) months += cur[1] - cur[0] + 1; cur = [s, e]; } else cur[1] = Math.max(cur[1], e);
  }
  if (cur) months += cur[1] - cur[0] + 1;
  return months / 12;
}

// ---------- lexical similarity (stand-in for embeddings) ----------
// shortcut: bag-of-words cosine, not semantic embeddings; upgrade to transformers.js or an embedding API if relevance feels off.
const STOP = new Set("a an and the or of to in on for with by at from as is are was were be been this that these those it its our your you we they their will would can could should must have has had do does did not no but if into over under using use used via per etc job role team work working experience years year strong good excellent knowledge ability skills skill responsibilities requirements required preferred including such other new across within also well".split(" "));
const tokens = (t = "") => (t.toLowerCase().match(/[a-z][a-z0-9#+.]*[a-z0-9#+]|[a-z]/g) || []).filter((w) => w.length > 1 && !STOP.has(w));
export function similarity(a, b) {
  const tf = (t) => tokens(t).reduce((m, w) => m.set(w, (m.get(w) || 0) + 1), new Map());
  const A = tf(a), B = tf(b);
  let dot = 0, na = 0, nb = 0;
  for (const [w, c] of A) { const x = Math.sqrt(c); na += x * x; if (B.has(w)) dot += x * Math.sqrt(B.get(w)); }
  for (const c of B.values()) nb += c;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// ---------- bullet checks ----------
const WEAK = /^(worked|responsible|helped|involved|assisted|participated|handled|did|was|were|tasked|duties|in charge|working|supported|took part|got)\b/i;
const YEAR = /\b(19|20)\d{2}\b/g;
const hasMetric = (b) => /\d/.test(b.replace(YEAR, "")) && !/\[(x|n)\b/i.test(b);
const ODD = /[�□\u0000-\u0008]|(?:\?\s*){3,}/;
// glued words ("developerBuilt") or very long tokens usually come from bad PDF extraction; tech names like LlamaIndex are exempt
const garbled = (line) => ODD.test(line) || line.split(/\s+/).some((t) =>
  (/[a-z]{4,}[A-Z][a-z]{3,}/.test(t) && !SKILLS.some((k) => has(t, k))) || (t.length >= 30 && !/https?:|www\.|\.com|@|\//.test(t)));

const W = { keywords: 25, skills: 20, experience: 15, title: 10, projects: 10, education: 5, structure: 10, contact: 5 };
export const CATEGORIES = [
  ["keywords", "Required keyword coverage"], ["skills", "Skills matching"], ["experience", "Experience relevance"], ["title", "Job title alignment"],
  ["projects", "Project relevance"], ["education", "Education & certifications"], ["structure", "Structure & readability"], ["contact", "Contact & sections"],
];
const TITLE_NOISE = new Set(["senior", "sr", "junior", "jr", "lead", "i", "ii", "iii", "iv", "associate", "principal", "staff", "the", "a", "-", "–", "of"]);
export const titleWords = (t = "") => [...new Set(t.toLowerCase().replace(/full[\s-]?stack/g, "fullstack").replace(/engineer/g, "developer").replace(/\bdev\b/g, "developer").replace(/[()/,|]/g, " ").split(/\s+/).filter((w) => w && !TITLE_NOISE.has(w)))];

export function analyze({ d, hidden = [], resumeName = "", jd = "", jdInfo = null, now = nowYM() }) {
  const on = (s) => !hidden.includes(s);
  const jobs = on("experience") ? d.jobs.filter((j) => j.role || j.company || j.bullets) : [];
  const jobBullets = jobs.flatMap((j) => bullets(j.bullets).map((b) => ({ b, job: j.role || j.company })));
  const projBullets = on("projects") ? bullets(d.projects) : [];
  const all = [...jobBullets.map((x) => x.b), ...projBullets];
  const skillsText = on("skills") ? d.skills : "";
  const eduText = on("education") ? d.education : "";
  const full = [d.name, d.email, d.phone, d.location, d.links, on("summary") ? d.summary : "", skillsText,
    ...jobs.flatMap((j) => [j.role, j.company, j.dates, j.bullets]), on("projects") ? d.projects : "", eduText].join("\n");
  const words = full.split(/\s+/).filter(Boolean).length;
  const hasJd = jd.trim().length > 30;
  const info = hasJd ? (jdInfo || extractJd(jd)) : null;
  const issues = [];
  const add = (type, sev, text, evidence = []) => issues.push({ type, sev, text, evidence: evidence.slice(0, 8) });
  const cat = {};

  // 1. keyword coverage
  if (info && (info.required.length || info.preferred.length)) {
    const mReq = info.required.filter((k) => has(full, k)), mPref = info.preferred.filter((k) => has(full, k));
    const den = info.required.length + 0.5 * info.preferred.length;
    cat.keywords = (mReq.length + 0.5 * mPref.length) / den;
    cat.kw = { required: info.required, preferred: info.preferred, missingReq: info.required.filter((k) => !mReq.includes(k)), missingPref: info.preferred.filter((k) => !mPref.includes(k)), matched: [...mReq, ...mPref] };
    if (cat.kw.missingReq.length) add(1, "high", `Missing ${cat.kw.missingReq.length} required keyword(s) from the job description. Add them only where you really have the experience.`, cat.kw.missingReq);
    if (cat.kw.missingPref.length) add(2, "low", `Missing ${cat.kw.missingPref.length} preferred keyword(s).`, cat.kw.missingPref);
  }

  // 2. skills matching: credit for listing in Skills section, half credit if only mentioned elsewhere
  if (info) {
    const jdSkills = dropContained([...new Set([...SKILLS.filter((k) => has(jd, k)), ...info.required.filter((k) => SKILLS.includes(k))])]);
    if (jdSkills.length) {
      const pts = jdSkills.map((k) => (has(skillsText, k) ? 1 : has(full, k) ? 0.5 : 0));
      cat.skills = pts.reduce((a, b) => a + b, 0) / jdSkills.length;
      const notInSkills = jdSkills.filter((k, i) => pts[i] === 0.5);
      const absent = jdSkills.filter((k, i) => pts[i] === 0);
      if (absent.length) add(3, "high", "Skills in the job description that appear nowhere in your resume:", absent);
      if (notInSkills.length) add(3, "medium", "You mention these in experience but not in the Skills section. List them there too:", notInSkills);
    }
  }

  // 3. experience relevance: wording overlap + years requirement
  const ranges = jobs.map((j) => ({ j, r: parseRange(j.dates, now) }));
  const years = totalYears(ranges.map((x) => x.r));
  if (hasJd) {
    const sim = similarity(jd, jobs.map((j) => `${j.role} ${j.bullets}`).join("\n"));
    const yrsOk = info?.minYears ? Math.min(1, years / info.minYears) : 1;
    cat.experience = jobs.length ? 0.75 * Math.min(1, sim / 0.3) + 0.25 * yrsOk : 0;
    cat.years = { years: Math.round(years * 10) / 10, need: info?.minYears || null };
    if (info?.minYears && years + 0.25 < info.minYears) add(7, "medium", `Job asks for ${info.minYears}+ years; your dated experience adds up to about ${cat.years.years}. Check every job has dates.`);
    if (jobs.length && sim < 0.12) add(7, "medium", "Your experience bullets share little wording with this job. Describe matching work in the job's own terms.");
  }

  // 4. title alignment
  const target = info?.title || "";
  if (target) {
    const want = titleWords(target);
    const cands = [resumeName, ...jobs.map((j) => j.role), on("summary") ? d.summary.split(/[.!]/)[0] : ""];
    cat.title = want.length ? Math.max(0, ...cands.map((c) => { const got = titleWords(c); return want.filter((w) => got.includes(w)).length / want.length; })) : 1;
    if (cat.title < 0.6) add(7, "medium", `Job title “${target}” doesn't match your titles. Use the target title in your summary or resume name if it honestly fits.`, jobs.map((j) => j.role).filter(Boolean));
  }

  // 5. projects
  if (hasJd) {
    cat.projects = projBullets.length ? Math.min(1, similarity(jd, projBullets.join("\n")) / 0.22) : 0;
    if (!projBullets.length) add(9, "medium", "No projects listed. Add 2–3 projects that use this job's stack.");
  }

  // 6. education & certifications
  const degree = /\b(b\.?\s?e|b\.?\s?tech|bachelor|m\.?\s?tech|mca|bca|b\.?\s?sc|m\.?\s?sc|master|degree|ph\.?d|diploma)\b/i;
  const jdDegree = hasJd && degree.test(jd), jdCert = hasJd && /certif/i.test(jd);
  cat.education = (eduText.trim() ? 0.6 : 0) + (jdDegree ? (degree.test(eduText) ? 0.4 : 0) : 0.4) - (jdCert && !/certif/i.test(full) ? 0.2 : 0);
  if (!eduText.trim()) add(9, "medium", "Add an Education section.");
  else if (jdDegree && !degree.test(eduText)) add(9, "medium", "The job mentions a degree; state your degree name clearly (e.g. B.E. Computer Science).");
  if (jdCert && !/certif/i.test(full)) add(1, "low", "The job mentions certifications. Add any you hold under Education.");

  // 7. structure & readability
  const weak = jobBullets.filter((x) => WEAK.test(x.b));
  const noMetric = jobBullets.filter((x) => !hasMetric(x.b));
  const placeholders = all.filter((b) => /\[(x|n)\b[^\]]*\]/i.test(b));
  const longB = all.filter((b) => b.split(/\s+/).length > 35), shortB = all.filter((b) => b.split(/\s+/).length < 6);
  const badJobs = jobs.filter((j) => { const n = bullets(j.bullets).length; return n < 2 || n > 8; });
  const seen = new Map(); all.forEach((b) => seen.set(b.toLowerCase(), (seen.get(b.toLowerCase()) || 0) + 1));
  const dupes = [...seen].filter(([, c]) => c > 1).map(([b]) => b);
  const firstWords = jobBullets.map((x) => x.b.split(/\s+/)[0].toLowerCase());
  const overused = [...new Set(firstWords)].filter((w) => firstWords.filter((x) => x === w).length >= 3);
  const kwCounts = SKILLS.map((k) => [k, (full.toLowerCase().match(new RegExp(`(^|[^a-z0-9])${esc(k)}($|[^a-z0-9])`, "g")) || []).length]).filter(([, c]) => c > 6);
  const readability = full.split("\n").filter(garbled);

  const fmts = new Set(ranges.flatMap((x) => x.r.fmts || []));
  const badDates = ranges.filter((x) => !x.r.ok);
  const dateOk = !badDates.length && fmts.size <= 1;

  const parts = [
    words >= 300 && words <= 900 ? 1 : words >= 200 && words <= 1100 ? 0.5 : 0,
    jobs.length ? 1 - badJobs.length / jobs.length : 0,
    all.length ? 1 - (longB.length + shortB.length) / all.length : 0,
    jobBullets.length ? 1 - weak.length / jobBullets.length : 0,
    jobBullets.length ? Math.min(1, (1 - noMetric.length / jobBullets.length) / 0.5) : 0,
    dateOk ? 1 : badDates.length ? 0 : 0.5,
    readability.length ? 0 : 1,
    dupes.length || overused.length || kwCounts.length ? 0.5 : 1,
  ];
  cat.structure = parts.reduce((a, b) => a + b, 0) / parts.length;

  if (weak.length) add(4, "medium", `${weak.length} bullet(s) start with weak verbs. Start with Built, Designed, Led, Reduced, Automated…`, weak.map((x) => x.b));
  if (jobBullets.length && noMetric.length / jobBullets.length > 0.5) add(5, "medium", `${noMetric.length} of ${jobBullets.length} experience bullets have no measurable result (numbers, %, scale). Add real figures where you know them.`, noMetric.map((x) => x.b));
  if (placeholders.length) add(5, "high", "Replace AI placeholders like [X%] with your real numbers, or remove them.", placeholders);
  if (dupes.length) add(6, "medium", "Duplicate bullets:", dupes);
  if (overused.length) add(6, "low", `Too many bullets start with the same word: ${overused.join(", ")}. Vary your verbs.`);
  if (kwCounts.length) add(6, "low", "Keywords repeated more than 6 times can look like keyword stuffing:", kwCounts.map(([k, c]) => `${k} (${c}×)`));
  if (longB.length) add(12, "low", "Bullets over 35 words are hard to scan. Split or trim them:", longB);
  if (shortB.length) add(9, "low", "Very short bullets (under 6 words) say little. Add what you did and the result:", shortB);
  if (badJobs.length) add(9, "low", "Each job reads best with 2–8 bullets:", badJobs.map((j) => `${j.role || j.company}: ${bullets(j.bullets).length} bullets`));
  if (badDates.length) add(8, "high", "Dates the parser can't read. Use “Jan 2022 – Present” or “01/2022 – 06/2023”:", badDates.map((x) => `${x.j.role || x.j.company}: “${x.j.dates || "no dates"}”`));
  if (fmts.size > 1) add(8, "medium", `Mixed date formats (${[...fmts].join(", ")}). Use one format everywhere.`);
  if (readability.length) add(10, "high", "Some lines look garbled (glued words or odd characters), often from PDF import. Fix them so ATS parsers can read them:", readability);
  if (words > 900) add(12, "medium", `Resume is about ${words} words. Aim for 450–850 (1–2 pages); cut older or unrelated bullets.`);
  if (words < 300) add(12, "medium", `Resume is only about ${words} words. Add detail to experience and projects.`);

  // 11. date consistency
  const ok = ranges.filter((x) => x.r.ok);
  ok.filter((x) => x.r.end < x.r.start).forEach((x) => add(11, "high", `End date before start date: ${x.j.role || x.j.company} (${x.j.dates}).`));
  ok.filter((x) => x.r.start > now || (x.r.end > now && !/present|current|now/i.test(x.j.dates))).forEach((x) => add(11, "medium", `Date in the future: ${x.j.role || x.j.company} (${x.j.dates}).`));
  const starts = ok.map((x) => x.r.start);
  if (starts.some((s, i) => i && s > starts[i - 1])) add(9, "medium", "Jobs are not in reverse-chronological order (newest first). Use ↑ ↓ to reorder.");
  const sorted = [...ok].sort((a, b) => a.r.start - b.r.start);
  sorted.slice(1).forEach((x, i) => { const gap = x.r.start - sorted[i].r.end - 1; if (gap > 6) add(11, "low", `Gap of about ${gap} months before ${x.j.role || x.j.company}. Be ready to explain it, or add what you did.`); });

  // 8. contact & sections
  const contact = [
    [!!d.name.trim(), "name"], [/[\w.+-]+@[\w-]+\.[\w.]+/.test(d.email), "email"], [/\d{10}|\+?\d[\d\s-]{9,}/.test(d.phone), "phone"],
    [!!d.location.trim(), "location"], [/linkedin|github/i.test(d.links), "LinkedIn/GitHub"],
    [on("summary") && !!d.summary.trim(), "Summary"], [!!skillsText.trim(), "Skills"], [!!jobs.length, "Experience"], [!!eduText.trim(), "Education"],
  ];
  const missingContact = contact.filter(([v]) => !v).map(([, k]) => k);
  cat.contact = 1 - missingContact.length / contact.length;
  if (missingContact.length) add(9, missingContact.length > 2 ? "high" : "medium", "Missing contact details or sections:", missingContact);

  // total over the categories that apply (no JD → only resume-quality categories)
  const keys = Object.keys(W).filter((k) => typeof cat[k] === "number");
  const max = keys.reduce((a, k) => a + W[k], 0);
  const got = keys.reduce((a, k) => a + W[k] * Math.max(0, Math.min(1, cat[k])), 0);
  const total = Math.round((got / max) * 100);
  const order = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => order[a.sev] - order[b.sev] || a.type - b.type);
  return {
    total, label: total >= 80 ? "Strong match" : total >= 65 ? "Good starting match" : total >= 45 ? "Needs work" : "Low match",
    categories: CATEGORIES.map(([k, name]) => ({ key: k, name, weight: W[k], pct: typeof cat[k] === "number" ? Math.round(Math.max(0, Math.min(1, cat[k])) * 100) : null })),
    kw: cat.kw || null, years: cat.years || null, info, issues, words, hasJd,
  };
}
