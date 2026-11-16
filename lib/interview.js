// Interview prep logic. AI drafts questions and rates answers against a fixed rubric; the overall score is computed here.
import { uid } from "./store.js";

export const QCATS = [
  ["technical", "Technical (from JD)"], ["stack", "Stack deep-dive"], ["scenario", "Scenario"],
  ["design", "System design"], ["hr", "HR & behavioural"],
];
export const RUBRIC = [
  ["relevance", "Answers the question"], ["structure", "Structure (STAR / clear steps)"], ["evidence", "Specific evidence from your work"],
  ["accuracy", "Technical accuracy"], ["communication", "Clarity & conciseness"],
];
const DIFF = ["easy", "medium", "hard"];

// keep only well-formed questions; evidence must point at real items of your profile, never free text
export function normalizeQuestions(raw, items) {
  const byId = Object.fromEntries(items.map((x) => [x.id, x]));
  const cats = QCATS.map(([k]) => k);
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).flatMap((x) => {
    const q = String(x?.q || "").trim();
    if (q.length < 10 || seen.has(q.toLowerCase())) return [];
    seen.add(q.toLowerCase());
    const ev = (Array.isArray(x.evidence) ? x.evidence : []).filter((id) => byId[id]).slice(0, 3);
    return [{
      id: uid(), q, category: cats.includes(x.category) ? x.category : "technical",
      topic: String(x.topic || "").slice(0, 30), difficulty: DIFF.includes(x.difficulty) ? x.difficulty : "medium",
      why: String(x.why || "").slice(0, 300), answer: String(x.answer || "").trim(),
      evidence: ev.map((id) => ({ id, text: byId[id].text, where: byId[id].where })),
      gap: !ev.length && x.category !== "hr" && x.category !== "design",
      followups: (Array.isArray(x.followups) ? x.followups : []).map(String).slice(0, 3),
    }];
  });
}

// overall = average of the rubric ratings (1–5) scaled to 100; the AI never sets this number
export function overall(rubric = {}) {
  const v = RUBRIC.map(([k]) => +rubric[k]?.score).filter((n) => n >= 1 && n <= 5);
  return v.length ? Math.round(((v.reduce((a, b) => a + b, 0) / v.length - 1) / 4) * 100) : null;
}

// balanced mock: round-robin across categories, harder questions first within each
export function pickMock(questions, n = 6) {
  const order = { hard: 0, medium: 1, easy: 2 };
  const pools = QCATS.map(([k]) => questions.filter((q) => q.category === k).sort((a, b) => order[a.difficulty] - order[b.difficulty]));
  const out = [];
  for (let i = 0; out.length < n && pools.some((p) => p.length > i); i++) for (const p of pools) if (p[i] && out.length < n) out.push(p[i]);
  return out;
}

export const bankItem = (q, extra = {}) => ({
  id: uid(), q: q.q, category: q.category || "technical", topic: q.topic || "", difficulty: q.difficulty || "medium",
  hint: q.answer || "", myAnswer: "", notes: "", attempts: [], addedAt: new Date().toISOString(), ...extra,
});

// needs practice: never practised, or last score under 60
export const needsPractice = (b) => !b.attempts.length || (b.attempts[b.attempts.length - 1].score ?? 0) < 60;
