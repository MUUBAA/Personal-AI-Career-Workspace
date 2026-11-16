"use client";
import { useMemo, useState } from "react";
import { profileYears } from "../lib/ats";
import { PRESET_BOARDS, ago, appFromJob, compat, dedupeKey, filterJobs, job, lpa, profileContext, salaryLabel } from "../lib/jobs";
import { recordDiscovered } from "../lib/analytics";
import { color, post } from "./ui";

const ROLES = [
  ["Full Stack", "full stack,fullstack,full-stack"],
  [".NET Full Stack", ".net,dotnet,c#,asp.net"],
  ["React", "react,frontend,front-end"],
  ["AI Full Stack", "ai engineer,llm,generative ai,ai full,genai"],
  ["Agentic AI", "agentic,ai agent,langchain,llm"],
  ["Node.js", "node.js,nodejs,node js,backend"],
  ["Python Backend", "python,django,fastapi"],
];
const SOURCES = [
  ["jobsforce", "JobsForce India"], ["jobvetta", "Jobvetta"], ["himalayas", "Himalayas"], ["jobicy", "Jobicy"],
  ["remotive", "Remotive"], ["arbeitnow", "Arbeitnow (EU)"], ["careers", "Company career pages"],
];
const MODES = [["remote", "Remote"], ["hybrid", "Hybrid"], ["onsite", "On-site"]];
const TYPES = [["full-time", "Full-time"], ["contract", "Contract"], ["part-time", "Part-time"], ["internship", "Internship"]];
const blankManual = { title: "", company: "", location: "", url: "", workMode: "", type: "", desc: "" };

export default function JobsPanel({ s, setS, r, setJd, setTab, flash }) {
  const years = Math.round(profileYears(s.profile) * 10) / 10;
  const [q, setQ] = useState(ROLES[0][1]);
  const [srcs, setSrcs] = useState(SOURCES.map(([k]) => k));
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState("");
  const [f, setF] = useState({ title: "", company: "", location: "", region: "all", modes: [], types: [], myYears: "", minLpa: "", techs: [], days: 0, hideExpired: true });
  const [sort, setSort] = useState("match");
  const [limit, setLimit] = useState(40);
  const [manual, setManual] = useState(null);
  const [link, setLink] = useState("");
  const [boardsOpen, setBoardsOpen] = useState(false);
  const [nb, setNb] = useState({ type: "greenhouse", slug: "", name: "" });
  const boards = s.boards || PRESET_BOARDS;
  const setBoards = (b) => setS((p) => ({ ...p, boards: b }));

  const ctx = useMemo(() => profileContext(s), [s.profile, s.resumes]); // eslint-disable-line react-hooks/exhaustive-deps
  const saved = useMemo(() => new Set(s.apps.flatMap((a) => [a.url, dedupeKey({ title: a.title, company: a.company })])), [s.apps]);
  const isSaved = (j) => saved.has(j.url) || saved.has(dedupeKey(j));

  async function search() {
    setBusy("Searching job boards…"); setRes(null); setLimit(40);
    try {
      const p = new URLSearchParams({ q, sources: srcs.join(","), boards: JSON.stringify(boards.filter((b) => !b.off)) });
      const j = await (await fetch(`/api/jobs?${p}`)).json();
      setRes({ ...j, jobs: j.jobs.map((x) => ({ ...x, fit: compat(x, ctx) })) });
      setS((p) => ({ ...p, discovered: recordDiscovered(p.discovered, j.jobs, undefined, dedupeKey) }));
    } catch { setRes({ jobs: [], sources: [], error: "Search failed, try again" }); }
    setBusy("");
  }

  const list = useMemo(() => {
    const out = filterJobs(res?.jobs || [], f);
    const sal = (j) => lpa(j)?.[1] ?? -1;
    return out.sort(sort === "new" ? (a, b) => String(b.posted).localeCompare(String(a.posted))
      : sort === "salary" ? (a, b) => sal(b) - sal(a)
      : (a, b) => b.fit.pct - a.fit.pct || String(b.posted).localeCompare(String(a.posted)));
  }, [res, f, sort]);

  const topTechs = useMemo(() => {
    const c = {};
    (res?.jobs || []).forEach((j) => j.techs.forEach((k) => { c[k] = (c[k] || 0) + 1; }));
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k]) => k);
  }, [res]);

  function wish(j) {
    if (isSaved(j)) return flash("Already in your wishlist.");
    setS((p) => ({ ...p, apps: [appFromJob(j, r.id), ...p.apps] }));
    flash(`Added “${j.title}” to your wishlist (Applications → Wishlist).`);
  }

  async function importUrl() {
    setBusy("Reading the job page…");
    try {
      const { job: j, via } = await post("/api/jobs/extract", { url: link.trim() });
      setManual({ ...blankManual, ...j, workMode: j.workMode || "", type: j.type || "", _job: j });
      flash(`Read via ${via}. Check the details, then save.`);
    } catch (e) { flash(e.message); }
    setBusy("");
  }

  function saveManual() {
    const base = manual._job || {};
    const j = { ...job({ ...base, source: base.source || "Manual entry", title: manual.title.trim(), company: manual.company.trim(), location: manual.location.trim(), url: manual.url.trim(), workMode: manual.workMode || null, type: manual.type || null, desc: manual.desc }) };
    j.fit = compat(j, ctx);
    wish(j);
    setManual(null); setLink("");
  }

  const tog = (k, v) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] });
  const noProfile = !s.profile.skills.trim() && !s.profile.jobs.some((j) => j.bullets.trim());

  return (
    <div className="jobsgrid">
      <aside className="card filters">
        <h2>Filters</h2>
        <label>Job title<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label>Company<input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></label>
        <label>Location<input placeholder="e.g. Bengaluru" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></label>
        <label>Region</label>
        <div>{[["all", "All"], ["india", "India + remote"], ["abroad", "Abroad"]].map(([k, l]) => <button key={k} className={`chip ${f.region === k ? "on" : ""}`} onClick={() => setF({ ...f, region: k })}>{l}</button>)}</div>
        <label>Work mode</label>
        <div className="checks">{MODES.map(([k, l]) => <label key={k} className="check"><input type="checkbox" checked={f.modes.includes(k)} onChange={() => tog("modes", k)} />{l}</label>)}</div>
        <label style={{ marginTop: 8 }}>Employment type</label>
        <div className="checks">{TYPES.map(([k, l]) => <label key={k} className="check"><input type="checkbox" checked={f.types.includes(k)} onChange={() => tog("types", k)} />{l}</label>)}</div>
        <div className="two" style={{ marginTop: 8 }}>
          <label>My experience (yrs)<input type="number" min="0" placeholder={String(years || "")} value={f.myYears} onChange={(e) => setF({ ...f, myYears: e.target.value })} /></label>
          <label>Min salary (LPA)<input type="number" min="0" value={f.minLpa} onChange={(e) => setF({ ...f, minLpa: e.target.value })} /></label>
        </div>
        <label>Posted within
          <select value={f.days} onChange={(e) => setF({ ...f, days: +e.target.value })}>
            {[[0, "Any time"], [1, "24 hours"], [3, "3 days"], [7, "7 days"], [14, "14 days"], [30, "30 days"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        {topTechs.length > 0 && <>
          <label>Required technologies</label>
          <div>{topTechs.map((k) => <button key={k} className={`chip small ${f.techs.includes(k) ? "on" : ""}`} onClick={() => tog("techs", k)}>{k}</button>)}</div>
        </>}
        <label className="check" style={{ marginTop: 8 }}><input type="checkbox" checked={f.hideExpired} onChange={(e) => setF({ ...f, hideExpired: e.target.checked })} />Hide expired listings</label>
        <button className="sec small" style={{ marginTop: 10 }} onClick={() => setF({ title: "", company: "", location: "", region: "all", modes: [], types: [], myYears: "", minLpa: "", techs: [], days: 0, hideExpired: true })}>Reset filters</button>
        <p className="msg">Salary filter only keeps jobs that list pay. Foreign pay is converted at rough fixed rates.</p>
      </aside>

      <div>
        <div className="card">
          <h2>Search</h2>
          <div>{ROLES.map(([n, v]) => <button key={n} className={`chip ${q === v ? "on" : ""}`} onClick={() => setQ(v)}>{n}</button>)}</div>
          <div className="inline" style={{ marginTop: 6 }}>
            <input aria-label="Keywords" placeholder="Keywords, comma separated" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
            <button disabled={!!busy || !srcs.length} onClick={search}>{busy === "Searching job boards…" ? "Searching…" : "Search"}</button>
          </div>
          <div className="checks" style={{ marginTop: 8 }}>
            {SOURCES.map(([k, l]) => <label key={k} className="check"><input type="checkbox" checked={srcs.includes(k)} onChange={() => setSrcs(srcs.includes(k) ? srcs.filter((x) => x !== k) : [...srcs, k])} />{l}</label>)}
            <button className="link small" onClick={() => setBoardsOpen(!boardsOpen)}>{boardsOpen ? "Hide" : "Edit"} career pages ({boards.filter((b) => !b.off).length})</button>
          </div>
          {boardsOpen && (
            <div className="boards">
              {boards.map((b, i) => (
                <div className="ver" key={`${b.type}:${b.slug}`}>
                  <label className="check"><input type="checkbox" checked={!b.off} onChange={() => setBoards(boards.map((x, n) => (n === i ? { ...x, off: !x.off } : x)))} />{b.name} <small className="msg">{b.type}/{b.slug}</small></label>
                  <button className="icon" aria-label={`Remove ${b.name}`} onClick={() => setBoards(boards.filter((_, n) => n !== i))}>✕</button>
                </div>
              ))}
              <div className="inline" style={{ marginTop: 6 }}>
                <select value={nb.type} onChange={(e) => setNb({ ...nb, type: e.target.value })}><option value="greenhouse">Greenhouse</option><option value="lever">Lever</option><option value="ashby">Ashby</option></select>
                <input placeholder="Board slug (from careers URL)" value={nb.slug} onChange={(e) => setNb({ ...nb, slug: e.target.value.trim() })} />
                <input placeholder="Company name" value={nb.name} onChange={(e) => setNb({ ...nb, name: e.target.value })} />
                <button className="small" disabled={!/^[\w.-]+$/.test(nb.slug) || !nb.name.trim()} onClick={() => { setBoards([...boards, { ...nb, name: nb.name.trim() }]); setNb({ type: nb.type, slug: "", name: "" }); }}>Add</button>
              </div>
              <p className="msg">The slug is the company part of URLs like boards.greenhouse.io/<b>slug</b>, jobs.lever.co/<b>slug</b> or jobs.ashbyhq.com/<b>slug</b>.</p>
            </div>
          )}
        </div>

        <div className="card">
          <div className="btns" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Add a job yourself</h2>
            <button className="sec small" onClick={() => setManual(manual ? null : { ...blankManual })}>{manual ? "Cancel" : "Manual entry"}</button>
          </div>
          <div className="inline" style={{ marginTop: 8 }}>
            <input placeholder="Paste a job link to import (LinkedIn/Naukri usually block this)" value={link} onChange={(e) => setLink(e.target.value)} />
            <button className="sec" disabled={!!busy || !/^https?:\/\/\S+$/.test(link.trim())} onClick={importUrl}>{busy === "Reading the job page…" ? "Reading…" : "Import"}</button>
          </div>
          {manual && (
            <div className="addform">
              <div className="two"><input placeholder="Job title *" value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} /><input placeholder="Company *" value={manual.company} onChange={(e) => setManual({ ...manual, company: e.target.value })} /></div>
              <div className="two"><input placeholder="Location" value={manual.location} onChange={(e) => setManual({ ...manual, location: e.target.value })} /><input placeholder="Job link" value={manual.url} onChange={(e) => setManual({ ...manual, url: e.target.value })} /></div>
              <div className="two">
                <select value={manual.workMode} onChange={(e) => setManual({ ...manual, workMode: e.target.value })}><option value="">Work mode…</option>{MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <select value={manual.type} onChange={(e) => setManual({ ...manual, type: e.target.value })}><option value="">Employment type…</option>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </div>
              <textarea placeholder="Job description" style={{ minHeight: 120 }} value={manual.desc} onChange={(e) => setManual({ ...manual, desc: e.target.value })} />
              <button disabled={!manual.title.trim() || !manual.company.trim()} onClick={saveManual}>Save to wishlist</button>
            </div>
          )}
        </div>

        {busy === "Searching job boards…" && <div className="card"><p className="msg">Searching {srcs.length} source(s)…</p></div>}
        {res && (
          <div className="card">
            <div className="btns" style={{ justifyContent: "space-between" }}>
              <h2 style={{ margin: 0 }}>{list.length} jobs <small className="msg">of {res.jobs.length}{res.merged ? ` · ${res.merged} duplicates merged` : ""}</small></h2>
              <label className="inline" style={{ width: "auto" }}>Sort
                <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: "auto" }}>
                  <option value="match">Best match to my profile</option><option value="new">Newest</option><option value="salary">Highest salary</option>
                </select>
              </label>
            </div>
            <div className="srcstat">{res.sources?.map((x) => <span key={x.id} className={`tag ${x.error ? "warn" : "ok"}`} title={x.error || ""}>{x.error ? "⚠" : "✓"} {x.name} {x.error ? `· ${x.error}` : `· ${x.count}`}</span>)}</div>
            {noProfile && <p className="msg err">Fill your master profile to get meaningful match scores.</p>}
            {res.error && <p className="msg err">{res.error}</p>}
            {list.slice(0, limit).map((j) => {
              const expired = j.validThrough && Date.parse(j.validThrough) < Date.now();
              return (
                <div className="job" key={j.id}>
                  <div className="jt">
                    <a href={j.url} target="_blank" rel="noopener noreferrer">{j.title}</a>
                    <span className="tag" style={{ background: color(j.fit.pct), color: "#fff" }} title={`Skills ${j.fit.skill}% · Title ${j.fit.title}% · Experience fit ${Math.round(j.fit.exp * 100)}%`}>{j.fit.pct}% match</span>
                  </div>
                  <div className="msg">{j.company || "Company not listed"} · {j.location || "Location not listed"}</div>
                  <div className="meta">
                    {j.workMode && <span>{MODES.find((m) => m[0] === j.workMode)?.[1]}</span>}
                    {j.type && <span>{j.type}</span>}
                    {j.expMin != null && <span>{j.expMin}{j.expMax != null ? `–${j.expMax}` : "+"} yrs</span>}
                    {salaryLabel(j) && <span>{salaryLabel(j)}</span>}
                    {j.posted && <span>{ago(j.posted)}</span>}
                    {expired && <span className="bad">Expired</span>}
                    <span className="src">via {j.sources.join(", ")}</span>
                  </div>
                  {j.fit.missing.length > 0 && <div>{j.fit.missing.slice(0, 5).map((k) => <span key={k} className="tag bad">{k}</span>)}</div>}
                  <div className="btns" style={{ marginTop: 6 }}>
                    <button className="sec small" disabled={isSaved(j)} onClick={() => wish(j)}>{isSaved(j) ? "In wishlist ✓" : "♡ Wishlist"}</button>
                    <button className="sec small" onClick={() => { setJd(`${j.title}\n${j.desc}`); setTab("tailor"); }}>Tailor resume</button>
                    {j.alt?.map((a) => <a key={a.url} className="small msg" href={a.url} target="_blank" rel="noopener noreferrer">also on {a.source}</a>)}
                  </div>
                </div>
              );
            })}
            {list.length > limit && <button className="sec" onClick={() => setLimit(limit + 40)}>Show more ({list.length - limit} left)</button>}
            {!list.length && <p className="msg">No jobs match these filters.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
