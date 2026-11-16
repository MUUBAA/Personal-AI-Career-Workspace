import { job } from "../../../../lib/jobs";
import { ask } from "../../../../lib/llm";
import { fromJsonLd, readJobPage } from "../../../../lib/fetchpage";

export const maxDuration = 30;

export async function POST(req) {
  const { url } = await req.json().catch(() => ({}));
  let u;
  try { u = new URL(String(url)); } catch { return Response.json({ error: "Enter a full link starting with https://" }, { status: 400 }); }
  try {
    const page = await readJobPage(u.toString());
    if (page.blocked) return Response.json({ error: "This site doesn't allow automated reading (robots.txt). Copy the job description and add it manually." }, { status: 403 });
    if (page.status >= 400) return Response.json({ error: `The page returned HTTP ${page.status}. It may have expired or need a login.` }, { status: 502 });
    if (page.posting) return Response.json({ job: fromJsonLd(page.posting, u.toString()), via: "structured data" });
    if (page.text.length < 200) return Response.json({ error: "Couldn't find a job description on that page (it may need a login or JavaScript). Add it manually." }, { status: 422 });

    // no structured data: let AI pull the fields out of the visible text (description itself stays verbatim)
    const r = await ask(`Extract job details from this web page text. Return JSON with: title, company, location, work_mode (remote|hybrid|onsite|null),
employment_type (full-time|part-time|contract|internship|null), min_years, max_years, salary_min, salary_max, currency (ISO code), period (year|month|null),
is_job_posting (true/false). Use null when unknown; never guess.

PAGE TITLE: ${page.title}
TEXT:
${page.text.slice(0, 9000)}`, true, 0);
    let f = {}; try { f = JSON.parse(r.text || "{}"); } catch {}
    if (r.error || f.is_job_posting === false) return Response.json({ error: r.error || "That page doesn't look like a job posting." }, { status: 422 });
    const n = (v) => (v === null || v === "" || isNaN(+v) ? null : +v);
    return Response.json({
      via: "page text + AI",
      job: job({
        id: `url:${u}`, source: "Imported link", title: f.title || page.title, company: f.company || "", location: f.location || "",
        workMode: f.work_mode || null, type: f.employment_type || null, expMin: n(f.min_years), expMax: n(f.max_years),
        salaryMin: n(f.salary_min), salaryMax: n(f.salary_max), currency: f.currency || null, period: f.period || null, url: u.toString(), desc: page.text.slice(0, 8000),
      }),
    });
  } catch (e) {
    return Response.json({ error: e.message || "Couldn't read that page" }, { status: 502 });
  }
}
