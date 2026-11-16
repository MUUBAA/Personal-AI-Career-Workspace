import { ask } from "../../../lib/llm";

// AI here only produces evidence (keyword lists) and explanations. Scores are computed by lib/ats.js rules.
export async function POST(req) {
  const { mode, jd, resume, analysis } = await req.json().catch(() => ({}));
  if (!jd?.trim()) return Response.json({ error: "Job description required" }, { status: 400 });
  const parse = (t) => { try { return JSON.parse(t); } catch { return null; } };

  if (mode === "extract") {
    const r = await ask(`Read this job description and return a JSON object:
"title": the job title,
"required": short keywords for must-have skills, tools, technologies, methods and certifications (1-3 words each, lowercase),
"preferred": same for nice-to-have items,
"min_years": minimum years of experience as a number, or null.
Only include items actually written in the job description. No soft skills like "communication" unless explicitly required.

JOB DESCRIPTION:
${jd.slice(0, 8000)}`, true, 0);
    if (r.error) return Response.json(r, { status: 502 });
    const j = parse(r.text);
    return j ? Response.json(j) : Response.json({ error: "AI returned an unreadable answer" }, { status: 502 });
  }

  if (mode === "advise") {
    if (!resume?.trim() || !analysis) return Response.json({ error: "Resume and analysis required" }, { status: 400 });
    const r = await ask(`You are an ATS and resume expert. A rule-based engine already scored this resume; do NOT give or change any score.
Write up to 6 recommended actions to improve this resume for this job. Each action must cite concrete evidence: a quote from the job description or the resume.
Never tell the candidate to claim a skill or experience they don't show; phrase such items as "if you have it".
Return JSON: {"actions":[{"action": "...", "evidence": "...", "area": "keywords|skills|experience|title|projects|education|structure|contact"}]}

ENGINE RESULTS:
${JSON.stringify(analysis).slice(0, 4000)}

JOB DESCRIPTION:
${jd.slice(0, 6000)}

RESUME:
${resume.slice(0, 8000)}`, true, 0.2);
    if (r.error) return Response.json(r, { status: 502 });
    const j = parse(r.text);
    return Array.isArray(j?.actions) ? Response.json({ actions: j.actions.slice(0, 6) }) : Response.json({ error: "AI returned an unreadable answer" }, { status: 502 });
  }

  return Response.json({ error: "Unknown mode" }, { status: 400 });
}
