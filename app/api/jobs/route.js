import { dedupe } from "../../../lib/jobs";
import { SOURCES } from "../../../lib/sources";

export const maxDuration = 30;

// GET /api/jobs?q=react,node.js&sources=jobsforce,himalayas&boards=<json>
export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const alts = (p.get("q") || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6);
  const want = (p.get("sources") || SOURCES.map((s) => s.id).join(",")).split(",");
  let boards = [];
  try { boards = JSON.parse(p.get("boards") || "[]").filter((b) => ["greenhouse", "lever", "ashby"].includes(b.type) && /^[\w.-]{1,80}$/.test(b.slug)); } catch {}

  const used = SOURCES.filter((s) => want.includes(s.id));
  const runs = await Promise.allSettled(used.map((s) => (s.needs && !process.env[s.needs] ? Promise.reject(new Error("no key")) : s.search({ alts, boards }))));
  const status = used.map((s, i) => ({
    id: s.id, name: s.name,
    count: runs[i].status === "fulfilled" ? runs[i].value.length : 0,
    error: runs[i].status === "rejected" ? (runs[i].reason?.message === "no key" ? `Set ${s.needs} to enable` : runs[i].reason?.message || "failed") : null,
  }));
  const all = runs.flatMap((r) => (r.status === "fulfilled" ? r.value : [])).filter((j) => j.title && j.url);
  const jobs = dedupe(all);
  return Response.json({ jobs: jobs.slice(0, 400), merged: all.length - jobs.length, sources: status });
}
