import { ask } from "../../../lib/llm";

const PROMPT = `Extract this resume into a JSON object with exactly these keys:
name, email, phone, location, links (LinkedIn/GitHub/portfolio joined by " | "), summary, skills (comma separated string),
jobs (array of {role, company, dates, bullets} where bullets is one string with one bullet per line),
projects (one bullet per line string), education (one entry per line string).
Copy facts exactly; never invent anything. Use "" for missing fields.

RESUME TEXT:
`;

export async function POST(req) {
  const { text } = await req.json().catch(() => ({}));
  if (!text?.trim()) return Response.json({ error: "No text found in the resume (scanned PDFs are not supported)" }, { status: 400 });

  const r = await ask(PROMPT + String(text).slice(0, 30000), true);
  if (r.error) return Response.json({ error: r.error }, { status: 502 });
  try {
    return Response.json({ resume: JSON.parse(r.text) });
  } catch {
    return Response.json({ error: "Could not read the resume, try another file" }, { status: 502 });
  }
}
