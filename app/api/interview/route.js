import { ask } from "../../../lib/llm";

export const maxDuration = 60;

const PARTS = {
  tech: `- 6 "technical": questions drawn directly from the job description's requirements.
- 6 "stack": deep-dive questions on the main technologies in BOTH the job and the candidate's profile (e.g. C#, .NET, ASP.NET Core, Entity Framework, React, TypeScript, Node.js, SQL), mixing concepts, debugging and performance.`,
  people: `- 4 "scenario": realistic on-the-job situations for this role (production incident, tight deadline, unclear requirement, code review disagreement...).
- 2 "design": system design questions sized to this role and company.
- 5 "hr": HR and behavioural questions (introduce yourself, why this company, strengths/weaknesses, conflict, notice period / expected CTC handling, why leaving).`,
};

export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const parse = (t) => { try { return JSON.parse(t); } catch { return null; } };

  if (b.mode === "questions") {
    if (!PARTS[b.part] || !b.items?.length) return Response.json({ error: "Missing profile or part" }, { status: 400 });
    const r = await ask(`You are a senior interviewer at ${b.company || "the company"} hiring a ${b.title || "software developer"} in India.
Write interview questions with suggested answers for this candidate.
${PARTS[b.part]}

SUGGESTED ANSWER RULES (critical):
- Base answers ONLY on the candidate's real experience listed in PROFILE ITEMS. Cite the item ids you used in "evidence".
- Never invent projects, employers, numbers or skills. If the candidate lacks direct experience, say so honestly in the answer
  (e.g. "I haven't used X in production, but I've done the closely related Y...") and leave evidence empty.
- Use STAR (Situation, Task, Action, Result) for behavioural and scenario answers. Keep answers 60–140 words, first person, spoken style.
- For "design", give a structured approach (requirements, components, data, scaling, trade-offs).

Return JSON: {"questions":[{"q":"...","category":"technical|stack|scenario|design|hr","topic":"short topic e.g. React","difficulty":"easy|medium|hard",
"why":"what the interviewer is testing","answer":"suggested answer","evidence":["item ids"],"followups":["likely follow-up questions"]}]}

CANDIDATE: ${b.name || "the candidate"}, about ${b.years || "?"} years of experience.
SKILLS: ${String(b.skills || "").slice(0, 800)}
SUMMARY: ${String(b.summary || "").slice(0, 800)}
PROFILE ITEMS:
${b.items.slice(0, 70).map((x) => `${x.id} [${x.where}]: ${x.text}`).join("\n")}

JOB DESCRIPTION:
${String(b.jd || "Not provided: use the role title and the candidate's stack.").slice(0, 6000)}`, true, 0.4);
    if (r.error) return Response.json(r, { status: 502 });
    const j = parse(r.text);
    return Array.isArray(j?.questions) ? Response.json({ questions: j.questions }) : Response.json({ error: "AI returned an unreadable answer, try again" }, { status: 502 });
  }

  if (b.mode === "evaluate") {
    if (!b.q || !String(b.answer || "").trim()) return Response.json({ error: "Write an answer first" }, { status: 400 });
    const r = await ask(`You are a fair, demanding interviewer. Rate the candidate's answer against this rubric, each 1–5 with a one-line reason:
relevance (answers what was asked), structure (STAR or clear steps), evidence (specific examples from their own work),
accuracy (technically correct; for HR questions judge professionalism), communication (clear, concise, confident).
Then give strengths, concrete improvements, and an improved answer that keeps ONLY facts the candidate wrote or that appear in their resume.
Use [placeholders] for numbers they should fill in; never invent results.
Return JSON: {"rubric":{"relevance":{"score":n,"why":"..."},"structure":{...},"evidence":{...},"accuracy":{...},"communication":{...}},
"strengths":["..."],"improvements":["..."],"improved":"..."}

QUESTION (${b.category || "general"}): ${String(b.q).slice(0, 600)}
CANDIDATE ANSWER: ${String(b.answer).slice(0, 4000)}
RESUME (for facts only): ${String(b.resume || "").slice(0, 5000)}
JOB: ${String(b.jd || "").slice(0, 2500)}`, true, 0.2);
    if (r.error) return Response.json(r, { status: 502 });
    const j = parse(r.text);
    return j?.rubric ? Response.json(j) : Response.json({ error: "AI returned an unreadable answer, try again" }, { status: 502 });
  }

  return Response.json({ error: "Unknown mode" }, { status: 400 });
}
