import { CLOSED, readJobPage } from "../../../../lib/fetchpage";

export const maxDuration = 60;

async function checkOne({ url, validThrough }) {
  if (validThrough && Date.parse(validThrough) < Date.now()) return { status: "expired", reason: "Past its closing date" };
  if (!/^https?:\/\//.test(url || "")) return { status: "unknown", reason: "No link saved" };
  const jf = url.match(/^https:\/\/jobsforceindia\.com\/jobs\/([\w-]+)/);
  if (jf) { // official API: 410 = closed
    const r = await fetch(`https://jobsforceindia.com/api/public/v1/jobs/${jf[1]}`, { signal: AbortSignal.timeout(10000) });
    return r.status === 410 || r.status === 404 ? { status: "expired", reason: "Closed on JobsForce India" } : { status: "active", reason: "" };
  }
  const p = await readJobPage(url);
  if (p.blocked) return { status: "unknown", reason: "Site doesn't allow automated checks" };
  if (p.status === 404 || p.status === 410) return { status: "expired", reason: `Page gone (HTTP ${p.status})` };
  if (/[?&]error=true/.test(p.finalUrl)) return { status: "expired", reason: "Redirected to the careers page" };
  if (p.posting?.validThrough && Date.parse(p.posting.validThrough) < Date.now()) return { status: "expired", reason: "Past its closing date" };
  if (CLOSED.test(p.text.slice(0, 20000))) return { status: "expired", reason: "Page says the job is closed" };
  return p.status < 400 ? { status: "active", reason: "" } : { status: "unknown", reason: `HTTP ${p.status}` };
}

// POST { items: [{ id, url, validThrough }] } -> { results: { [id]: { status, reason, checkedAt } } }
export async function POST(req) {
  const { items = [] } = await req.json().catch(() => ({}));
  const list = items.slice(0, 25);
  const res = await Promise.allSettled(list.map(checkOne));
  const at = new Date().toISOString();
  return Response.json({ results: Object.fromEntries(list.map((x, i) => [x.id, { ...(res[i].status === "fulfilled" ? res[i].value : { status: "unknown", reason: res[i].reason?.message || "Check failed" }), checkedAt: at }])) });
}
