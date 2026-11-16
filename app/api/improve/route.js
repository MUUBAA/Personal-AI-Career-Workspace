import { ask } from "../../../lib/llm";

const NO_INVENT = "Never invent employers, tools, numbers or results. If a metric would help but none is given, insert a placeholder like [X%] or [N users] for the candidate to fill in.";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { mode, bullet, role, profile } = body;

  if (mode === "bullet") {
    if (!bullet?.trim()) return Response.json({ error: "Empty bullet" }, { status: 400 });
    const r = await ask(`Rewrite this resume bullet for a ${role || "software developer"} resume: start with a strong action verb, show impact, stay under 30 words, keep every fact. ${NO_INVENT}
Return only the rewritten bullet, no quotes or explanation.

BULLET: ${bullet.slice(0, 1000)}`);
    return r.error ? Response.json(r, { status: 502 }) : Response.json({ text: r.text.trim().replace(/^[-•*"\s]+|"$/g, "") });
  }

  if (mode === "role") {
    if (!profile?.trim() || !role?.trim()) return Response.json({ error: "Profile and role required" }, { status: 400 });
    const r = await ask(`From this master career profile, prepare a resume for the target role "${role}".
Return a JSON object with:
"summary": 3 sentences aimed at the role, using only facts in the profile,
"skills": comma separated string of skills from the profile, most relevant to the role first, drop irrelevant ones.
${NO_INVENT}

PROFILE:
${profile.slice(0, 15000)}`, true);
    if (r.error) return Response.json(r, { status: 502 });
    try { return Response.json(JSON.parse(r.text)); } catch { return Response.json({ error: "AI returned an unreadable answer, try again" }, { status: 502 }); }
  }

  if (mode === "email") {
    const { kind, app = {}, name } = body;
    const what = {
      followup: "a polite follow-up on a job application with no reply yet",
      thankyou: "a thank-you note sent the day after an interview",
      status: "a short, polite request for an update on the hiring decision after interviews",
    }[kind];
    if (!what || !app.company) return Response.json({ error: "Unknown email type or missing company" }, { status: 400 });
    const r = await ask(`Write ${what}.
Candidate: ${name || "[Your Name]"}. Company: ${app.company}. Role: ${app.title || "the role"}. Applied on: ${app.appliedAt || "unknown"}.
Recipient: ${app.contact || "[Recruiter Name]"}. Interview rounds done: ${app.interviews?.join(", ") || "none"}.
Format: first line "Subject: ...", blank line, then the body under 120 words, warm and professional, Indian business English, no buzzwords.
Use [placeholders] for anything unknown. Never invent facts about the candidate or the interview. Plain text only, no markdown.`);
    return r.error ? Response.json(r, { status: 502 }) : Response.json({ text: r.text.trim() });
  }

  return Response.json({ error: "Unknown mode" }, { status: 400 });
}
