// Server-only job source adapters. Each returns job() objects; the route merges, dedupes and reports per-source status.
import { job } from "./jobs.js";

const plain = (h = "") => {
  const dec = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  return dec(dec(h)).replace(/<(br|\/p|\/li|\/div|\/h\d)[^>]*>/gi, "\n").replace(/<[^>]*>/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, 6000);
};
const iso = (v) => { if (v == null || v === "") return null; const d = new Date(typeof v === "number" && v < 1e12 ? v * 1000 : v); return isNaN(d) ? null : d.toISOString(); };
const TYPES = { fulltime: "full-time", "full-time": "full-time", full_time: "full-time", parttime: "part-time", "part-time": "part-time", part_time: "part-time", contract: "contract", contractor: "contract", internship: "internship", intern: "internship", temporary: "temporary", freelance: "contract" };
const type = (t) => TYPES[String(Array.isArray(t) ? t[0] : t || "").toLowerCase().replace(/\s+/g, "")] || null;
const wm = (t) => ({ remote: "remote", hybrid: "hybrid", onsite: "onsite", "on-site": "onsite", in_office: "onsite" })[String(t || "").toLowerCase().replace(/\s+/g, "")] || null;

const get = (url, headers = {}) => fetch(url, {
  headers: { "User-Agent": "Mozilla/5.0 (JobKit personal job search)", Accept: "application/json", ...headers },
  signal: AbortSignal.timeout(10000), next: { revalidate: 600 },
}).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });

const matches = (alts) => (j) => !alts.length || alts.some((a) => `${j.title} ${j.tags.join(" ")}`.toLowerCase().includes(a));

export const SOURCES = [
  {
    id: "jobsforce", name: "JobsForce India", note: "Official free API, India jobs",
    async search({ alts }) {
      // official keyless API (jobsforceindia.com/openapi.json, 120 req/min); agency jobs are for confidential clients
      const rows = await Promise.all((alts.length ? alts : ["developer"]).slice(0, 3).map((q) =>
        get(`https://jobsforceindia.com/api/public/v1/jobs?category=IT&per_page=20&q=${encodeURIComponent(q)}`).then((j) => j.results || [])));
      return rows.flat().map((x) => job({
        id: `jobsforce:${x.id}`, source: "JobsForce India", title: x.title,
        company: x.hiring?.type === "agency" ? "Confidential client (via JobsForce India)" : x.hiring?.display || x.hiring?.name || "",
        location: [x.location?.city, x.location?.state, "India"].filter(Boolean).join(", "), workMode: wm(x.work_mode), type: type(x.job_type),
        expMin: x.experience?.min_years ?? null, expMax: x.experience?.max_years ?? null,
        salaryMin: x.salary?.min ?? null, salaryMax: x.salary?.max ?? null, currency: x.salary?.currency || null, period: x.salary?.period || null,
        tags: [x.category].filter(Boolean), posted: iso(x.posted_date), validThrough: iso(x.valid_through), url: x.url, applyUrl: x.apply_url, desc: x.summary || "",
      }));
    },
  },
  {
    id: "jobvetta", name: "Jobvetta", note: "India jobs from employer sources (needs free key, 50 calls/day)", needs: "JOBVETTA_API_KEY",
    async search({ alts }) {
      const j = await get(`https://api.jobvetta.com/v1/jobs?limit=10&q=${encodeURIComponent(alts[0] || "software developer")}`, { Authorization: `Bearer ${process.env.JOBVETTA_API_KEY}` });
      return (j.jobs || []).map((x) => job({
        id: `jobvetta:${x.job_id}`, source: "Jobvetta", title: x.title, company: x.company || "", location: x.location || "India",
        workMode: wm(x.work_model), type: type(x.employment_type), url: x.url, posted: iso(x.created_at), desc: x.description || "",
      }));
    },
  },
  {
    id: "himalayas", name: "Himalayas", note: "Remote jobs worldwide",
    async search({ alts }) {
      const rows = await Promise.all((alts.length ? alts : ["developer"]).slice(0, 2).map((q) =>
        get(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}`).then((j) => j.jobs || [])));
      return rows.flat().map((x) => {
        const locs = x.locationRestrictions || [];
        return job({
          id: `himalayas:${x.guid}`, source: "Himalayas", title: x.title, company: x.companyName || "",
          location: !locs.length ? "Remote (worldwide)" : locs.includes("India") ? `Remote (${locs.length > 1 ? `${locs.length} countries incl. ` : ""}India)` : `Remote (${locs.slice(0, 3).join(", ")}${locs.length > 3 ? ` +${locs.length - 3}` : ""})`,
          workMode: "remote", type: type(x.employmentType), salaryMin: x.minSalary, salaryMax: x.maxSalary, currency: x.currency, period: x.salaryPeriod || "year",
          tags: x.categories || [], posted: iso(x.pubDate), validThrough: iso(x.expiryDate), url: x.guid || x.applicationLink, applyUrl: x.applicationLink, desc: plain(x.description || x.excerpt),
        });
      });
    },
  },
  {
    id: "jobicy", name: "Jobicy", note: "Remote jobs",
    async search({ alts }) {
      const j = await get("https://jobicy.com/api/v2/remote-jobs?count=100&industry=dev");
      return (j.jobs || []).map((x) => job({
        id: `jobicy:${x.id}`, source: "Jobicy", title: x.jobTitle, company: x.companyName, location: x.jobGeo === "Anywhere" ? "Remote (worldwide)" : `Remote (${x.jobGeo})`,
        workMode: "remote", type: type(x.jobType), salaryMin: x.salaryMin ?? null, salaryMax: x.salaryMax ?? null, currency: x.salaryCurrency || null, period: x.salaryPeriod || "year",
        tags: [].concat(x.jobIndustry || []), posted: iso(x.pubDate), url: x.url, desc: plain(x.jobDescription || x.jobExcerpt),
      })).filter(matches(alts));
    },
  },
  {
    id: "remotive", name: "Remotive", note: "Remote jobs",
    async search({ alts }) {
      const j = await get("https://remotive.com/api/remote-jobs?category=software-dev&limit=200");
      return j.jobs.map((x) => job({
        id: `remotive:${x.id}`, source: "Remotive", title: x.title, company: x.company_name, location: x.candidate_required_location ? `Remote (${x.candidate_required_location})` : "Remote (worldwide)",
        workMode: "remote", type: type(x.job_type), tags: x.tags || [], posted: iso(x.publication_date), url: x.url, desc: plain(x.description),
      })).filter(matches(alts));
    },
  },
  {
    id: "arbeitnow", name: "Arbeitnow", note: "Europe, often visa-friendly",
    async search({ alts }) {
      const j = await get("https://www.arbeitnow.com/api/job-board-api");
      return j.data.map((x) => job({
        id: `arbeitnow:${x.slug}`, source: "Arbeitnow", title: x.title, company: x.company_name, location: x.location || "",
        workMode: x.remote ? "remote" : null, type: type(x.job_types), tags: x.tags || [], posted: iso(x.created_at), url: x.url, desc: plain(x.description),
      })).filter(matches(alts));
    },
  },
  {
    id: "careers", name: "Company career pages", note: "Greenhouse, Lever and Ashby boards you choose",
    async search({ alts, boards = [] }) {
      const one = async (b) => {
        if (b.type === "greenhouse") return (await get(`https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs?content=true`)).jobs.map((x) => job({
          id: `gh:${b.slug}:${x.id}`, source: `${b.name} careers`, title: x.title, company: b.name, location: x.location?.name || "",
          posted: iso(x.first_published || x.updated_at), validThrough: iso(x.application_deadline), url: x.absolute_url, desc: plain(x.content),
        }));
        if (b.type === "lever") return (await get(`https://api.lever.co/v0/postings/${b.slug}?mode=json`)).map((x) => job({
          id: `lever:${b.slug}:${x.id}`, source: `${b.name} careers`, title: x.text, company: b.name, location: x.categories?.allLocations?.join(", ") || x.categories?.location || "",
          workMode: wm(x.workplaceType), type: type(x.categories?.commitment), tags: [x.categories?.team].filter(Boolean),
          salaryMin: x.salaryRange?.min ?? null, salaryMax: x.salaryRange?.max ?? null, currency: x.salaryRange?.currency || null, period: x.salaryRange?.interval?.replace("per-", "") || null,
          posted: iso(x.createdAt), url: x.hostedUrl, applyUrl: x.applyUrl, desc: (x.descriptionPlain || "") + "\n" + (x.lists || []).map((l) => `${l.text}\n${plain(l.content)}`).join("\n"),
        }));
        if (b.type === "ashby") return (await get(`https://api.ashbyhq.com/posting-api/job-board/${b.slug}`)).jobs.filter((x) => x.isListed !== false).map((x) => job({
          id: `ashby:${b.slug}:${x.id}`, source: `${b.name} careers`, title: x.title, company: b.name, location: [x.location, ...(x.secondaryLocations || []).map((l) => l.location)].filter(Boolean).join(", "),
          workMode: x.isRemote ? "remote" : wm(x.workplaceType), type: type(x.employmentType), tags: [x.department, x.team].filter(Boolean),
          posted: iso(x.publishedAt), url: x.jobUrl, applyUrl: x.applyUrl, desc: x.descriptionPlain || plain(x.descriptionHtml),
        }));
        return [];
      };
      const res = await Promise.allSettled(boards.slice(0, 15).map(one));
      return res.flatMap((r) => (r.status === "fulfilled" ? r.value : [])).filter(matches(alts));
    },
  },
];
