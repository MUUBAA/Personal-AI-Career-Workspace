import { ask } from "../../../lib/llm";

const str = (v, n) => String(v ?? "").slice(0, n);
const RULE = "Use ONLY facts and skills that appear in the profile below. Never invent employers, numbers, skills or certifications.";

const PROMPTS = {
  // text of LinkedIn's "Save to PDF" export -> fields
  import: (b) => `This is the text of a LinkedIn profile exported with "Save to PDF". Return JSON with exactly these keys:
headline, about, location, skills (comma separated string of every skill listed, including "Top Skills"), certifications (one per line string),
education (one per line string), experience (array of {title, company, dates, description}; description = all text under that role).
Copy text exactly; use "" for missing fields. Ignore page numbers and "Page x of y".

PROFILE TEXT:
${str(b.text, 30000)}`,
  headline: (b) => `Write 3 alternative LinkedIn headlines (each 120-220 characters) for someone targeting "${str(b.role, 80)}" roles in India.
Format: target role | 3-4 strongest skills | concrete value they deliver. ${RULE}
Return JSON {"options": ["...", "...", "..."]}.

PROFILE:
${str(b.profile, 8000)}`,
  about: (b) => `Write a LinkedIn About section (180-280 words, first person, plain text, short paragraphs, no emojis, no hashtags) for someone targeting "${str(b.role, 80)}" roles.
Open with what they build, then 2-3 proof points from their experience (keep any numbers exactly as given), then their stack in a sentence, and end with a call to action using their email if present. ${RULE}
Return JSON {"text": "..."}.

PROFILE:
${str(b.profile, 8000)}`,
  post: (b) => `Draft a LinkedIn post (100-180 words, first person, plain text, max 3 hashtags at the end) about this work: "${str(b.topic, 600)}".
Structure: a one-line hook, what the problem was, what they did and the stack, the result, one lesson learned, and a question to invite comments. ${RULE}
Return JSON {"text": "..."}.

PROFILE:
${str(b.profile, 6000)}`,
};

export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const p = PROMPTS[b.mode];
  if (!p) return Response.json({ error: "Unknown mode" }, { status: 400 });
  if (b.mode === "import" && !b.text?.trim()) return Response.json({ error: "No text found in that PDF" }, { status: 400 });
  const r = await ask(p(b), true, b.mode === "import" ? 0 : 0.6);
  if (r.error) return Response.json(r, { status: 502 });
  try { return Response.json(JSON.parse(r.text)); } catch { return Response.json({ error: "AI returned an unreadable answer, try again" }, { status: 502 }); }
}
