import { ask } from "../../../lib/llm";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { mode = "notes", jd, resume } = body;
  if (!jd?.trim()) return Response.json({ error: "Job description required" }, { status: 400 });

  // proposals only: the client validates every one with lib/tailor.js guardrails before you can accept it
  if (mode === "suggest") {
    const { summary, items = [], extra = [], allowed = [], gaps = [] } = body;
    const r = await ask(`You are tailoring a resume to a job. Propose wording changes only.
STRICT RULES:
- Keep every fact. Never add a tool, skill, technology, employer, number or result that the original item does not contain.
- You MAY use an ALLOWED keyword only if the original item already describes that work; otherwise leave it out.
- NEVER mention any GAP keyword. These are skills the candidate does not have.
- Use strong action verbs and the job's wording where it truthfully fits. Under 30 words per bullet.
- Rewrite at most 8 items, only ones that clearly improve the match. Skip items that are already good.
- From MASTER BULLETS, pick up to 4 that are relevant to this job (by id only, text is copied as-is).

Return JSON:
{"summary": {"after": "...", "reason": "..."} or null,
 "bullets": [{"id": "<item id>", "after": "...", "reason": "<which job requirement this targets>"}],
 "add": [{"id": "<master id>", "reason": "..."}]}

ALLOWED keywords (candidate has them): ${allowed.join(", ") || "none"}
GAP keywords (candidate does NOT have them): ${gaps.join(", ") || "none"}

CURRENT SUMMARY: ${String(summary || "").slice(0, 1500)}

ITEMS:
${items.slice(0, 60).map((x) => `${x.id} [${x.where}]: ${x.text}`).join("\n")}

MASTER BULLETS (not in this resume yet):
${extra.slice(0, 40).map((x) => `${x.id} [${x.where}]: ${x.text}`).join("\n") || "none"}

JOB DESCRIPTION:
${jd.slice(0, 7000)}`, true, 0.3);
    if (r.error) return Response.json(r, { status: 502 });
    try { return Response.json(JSON.parse(r.text)); } catch { return Response.json({ error: "AI returned an unreadable answer, try again" }, { status: 502 }); }
  }

  if (!resume?.trim()) return Response.json({ error: "Resume required" }, { status: 400 });
  const { text, error } = await ask(`Using ONLY facts present in the resume (never invent skills, employers or numbers), help the candidate apply to this job.
Return markdown with these sections:
## Short cover note (under 120 words)
## 5 likely interview questions with one-line answer hints from the candidate's real experience
## Gaps to prepare for (skills the job wants that the resume doesn't show, and how to talk about them honestly)

RESUME:
${resume.slice(0, 12000)}

JOB DESCRIPTION:
${jd.slice(0, 8000)}`);
  return error ? Response.json({ error }, { status: 502 }) : Response.json({ text });
}
