// Server-only: fetch a user-supplied job URL safely and politely.
// - blocks private/internal addresses (SSRF), re-checking every redirect
// - honours robots.txt for User-agent *
// - reads schema.org JobPosting JSON-LD, which sites publish for machines
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { job } from "./jobs.js";

const UA = "Mozilla/5.0 (JobKit personal job tracker)";
const PRIVATE = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^::1$/, /^f[cd]/i, /^fe80/i, /^::ffff:(127|10|192\.168|169\.254)\./i];

async function assertPublic(u) {
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) links are allowed");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname)) throw new Error("That address is not allowed");
  const ips = isIP(u.hostname) ? [u.hostname] : (await lookup(u.hostname, { all: true })).map((a) => a.address);
  if (ips.some((ip) => PRIVATE.some((r) => r.test(ip)))) throw new Error("That address is not allowed");
}

// shortcut: DNS is checked before fetch, so a rebinding attack between check and fetch is not covered; fine for a single-user app
async function safeGet(url, max = 1.5e6) {
  let u = new URL(url);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(u);
    const r = await fetch(u, { redirect: "manual", headers: { "User-Agent": UA, Accept: "text/html,application/json" }, signal: AbortSignal.timeout(10000) });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { u = new URL(r.headers.get("location"), u); continue; }
    const buf = await r.arrayBuffer();
    return { status: r.status, url: u.toString(), text: new TextDecoder().decode(buf.slice(0, max)) };
  }
  throw new Error("Too many redirects");
}

export async function robotsAllows(url) {
  const u = new URL(url);
  let txt = "";
  try { const r = await safeGet(`${u.origin}/robots.txt`, 2e5); if (r.status === 200) txt = r.text; } catch { return true; }
  return robotsPermit(txt, u.pathname + u.search);
}

export function robotsPermit(txt, path) {
  const rules = []; let mine = false, inGroup = false;
  for (const raw of txt.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [k, v] = [m[1].toLowerCase(), m[2].trim()];
    if (k === "user-agent") { if (!inGroup) mine = false; inGroup = true; if (v === "*") mine = true; continue; }
    inGroup = false;
    if (mine && (k === "allow" || k === "disallow") && v) rules.push({ allow: k === "allow", re: new RegExp(`^${v.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$")}`), len: v.length });
  }
  const hit =rules.filter((r) => r.re.test(path)).sort((a, b) => b.len - a.len || b.allow - a.allow)[0];
  return !hit || hit.allow;
}

function jsonLdJob(html) {
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data; try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const nodes = [].concat(data, data?.["@graph"] || []).flat();
    const p = nodes.find((n) => [].concat(n?.["@type"]).includes("JobPosting"));
    if (p) return p;
  }
  return null;
}

const strip = (h = "") => h.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<(br|\/p|\/li|\/div|\/h\d)[^>]*>/gi, "\n").replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

export const CLOSED = /no longer (accepting|available|open)|position (has been |is )?(filled|closed)|job (posting )?(has )?(expired|closed)|this (job|role|position) is (closed|no longer)|not accepting (new )?applications/i;

export function fromJsonLd(p, url) {
  const locs = [].concat(p.jobLocation || []).map((l) => l?.address || {}).map((a) => [a.addressLocality, a.addressRegion, typeof a.addressCountry === "string" ? a.addressCountry : a.addressCountry?.name].filter(Boolean).join(", "));
  const sal = p.baseSalary?.value || {};
  const months = +p.experienceRequirements?.monthsOfExperience;
  return job({
    id: `url:${url}`, source: "Imported link", title: p.title || "", company: p.hiringOrganization?.name || "",
    location: locs.filter(Boolean).join(" · ") || (p.jobLocationType === "TELECOMMUTE" ? "Remote" : ""),
    workMode: p.jobLocationType === "TELECOMMUTE" ? "remote" : null,
    type: ((t) => (/intern/.test(t) ? "internship" : /part/.test(t) ? "part-time" : /contract|freelance/.test(t) ? "contract" : /temp/.test(t) ? "temporary" : /full/.test(t) ? "full-time" : null))(String([].concat(p.employmentType || [])[0] || "").toLowerCase()),
    salaryMin: sal.minValue ?? sal.value ?? null, salaryMax: sal.maxValue ?? sal.value ?? null, currency: p.baseSalary?.currency || null,
    period: (sal.unitText || "").toLowerCase() || null, expMin: months ? Math.round(months / 12) : null,
    posted: p.datePosted ? new Date(p.datePosted).toISOString() : null, validThrough: p.validThrough ? new Date(p.validThrough).toISOString() : null,
    url, desc: strip(p.description || "").slice(0, 8000),
  });
}

export async function readJobPage(url) {
  if (!(await robotsAllows(url))) return { blocked: true };
  const r = await safeGet(url);
  const p = jsonLdJob(r.text);
  const title = (r.text.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || r.text.match(/<title>([^<]+)/i) || [])[1] || "";
  return { status: r.status, finalUrl: r.url, posting: p, title: strip(title), text: strip(r.text).slice(0, 12000) };
}
