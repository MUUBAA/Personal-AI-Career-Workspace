"use client";
import { useEffect, useState } from "react";
import { analyze, extractJd, mergeJd } from "../lib/ats";
import { addVersion, newApp, newResume, toText } from "../lib/store";
import { apply, buildSuggestions, gapReport, items } from "../lib/tailor";
import { Md, color, post } from "./ui";

const STATUS = { ok: ["Safe", "var(--good)"], warn: ["Check", "var(--warn)"], blocked: ["Blocked", "var(--bad)"] };
const KIND = { summary: "Summary", skills: "Skills", bullet: "Bullet rewrite", project: "Project rewrite", add: "Add from master profile" };

function Diff({ before, after }) {
  const had = new Set(before.toLowerCase().match(/[a-z0-9#+.%]+/g) || []);
  return <>{after.split(/(\s+)/).map((w, i) => (had.has(w.toLowerCase().replace(/[^a-z0-9#+.%]/g, "")) || !w.trim() ? w : <mark key={i}>{w}</mark>))}</>;
}

export default function TailorPanel({ s, setS, r, jd, setJd, aiJd, setAiJd, setDraft, setTab, flash }) {
  const [sugs, setSugs] = useState(null);
  const [dec, setDec] = useState({});
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [notes, setNotes] = useState("");
  const [link, setLink] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [forKey, setForKey] = useState("");

  const hasJd = jd.trim().length > 30;
  const info = hasJd ? mergeJd(extractJd(jd), aiJd[jd]) : null;
  const gaps = info ? gapReport(info, r.d, s.profile) : null;
  const key = `${r.id}|${jd}`;
  const live = sugs && forKey === key ? sugs : null; // suggestions are only valid for the resume + JD they were made for
  const accepted = (live || []).filter((x) => dec[x.id] === "accept" && x.check.status !== "blocked");
  const draft = apply(r.d, accepted);
  const a0 = info ? analyze({ d: r.d, hidden: r.hidden, resumeName: r.name, jd, jdInfo: info }) : null;
  const a1 = info ? analyze({ d: draft, hidden: r.hidden, resumeName: title || r.name, jd, jdInfo: info }) : null;
  const acceptedKey = accepted.map((x) => x.id).join(",");

  useEffect(() => { setDraft(accepted.length ? draft : null); }, [acceptedKey, r.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (info?.title && !title) setTitle(info.title); }, [info?.title]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    setErr(""); setNotes("");
    let lists = aiJd[jd];
    try {
      if (!lists) {
        setBusy("Reading job requirements…");
        lists = await post("/api/ats", { mode: "extract", jd });
        setAiJd((m) => ({ ...m, [jd]: lists }));
      }
    } catch (e) { setErr(`Keyword extraction failed (${e.message}); using rule-based keywords.`); }
    const inf = mergeJd(extractJd(jd), lists);
    const g = gapReport(inf, r.d, s.profile);
    const gapKeys = g.gaps.map((x) => x.k);
    const { list, extra } = items(r.d, s.profile);
    let ai = null;
    try {
      setBusy("Drafting suggestions…");
      ai = await post("/api/tailor", { mode: "suggest", jd, summary: r.d.summary, items: list, extra, allowed: [...g.inResume, ...g.inProfile].map((x) => x.k), gaps: gapKeys });
    } catch (e) { setErr(`AI suggestions failed (${e.message}). Showing rule-based suggestions only.`); }
    setSugs(buildSuggestions(ai, r.d, s.profile, inf, gapKeys));
    setForKey(key); setDec({});
    setBusy("");
  }

  async function prepNotes() {
    setBusy("Writing cover note…"); setErr("");
    try { setNotes((await post("/api/tailor", { mode: "notes", jd, resume: toText(draft, r.hidden) })).text); } catch (e) { setErr(e.message); }
    setBusy("");
  }

  function loadApp(id) {
    setLink(id);
    const a = s.apps.find((x) => x.id === id);
    if (!a) return;
    setCompany(a.company); setTitle(a.title);
    if (a.desc) setJd(a.desc);
  }

  function save() {
    const label = company.trim() || title.trim() || "job";
    let nr = { ...newResume(`${title.trim() || r.name} · ${label}`, draft), template: r.template, hidden: [...r.hidden] };
    let app = null;
    if (link === "new") app = newApp({ company: company.trim(), title: title.trim(), desc: jd.slice(0, 3000), resumeId: nr.id });
    const appId = link === "new" ? app.id : link;
    nr = addVersion({ ...nr, meta: { jd: jd.slice(0, 6000), company, title, appId, baseId: r.id, at: new Date().toISOString(), atsBefore: a0.total, atsAfter: a1.total } }, `Tailored for ${label}`);
    setS((p) => ({
      ...p, resumes: [...p.resumes, nr], active: nr.id,
      apps: app ? [app, ...p.apps] : p.apps.map((x) => (x.id === appId ? { ...x, resumeId: nr.id, desc: x.desc || jd.slice(0, 3000) } : x)),
    }));
    setSugs(null); setDec({}); setDraft(null);
    flash(`Saved new resume “${nr.name}” (ATS ${a0.total} → ${a1.total}). Your original “${r.name}” is unchanged.`);
  }

  const counts = { accept: 0, reject: 0 };
  (live || []).forEach((x) => { if (dec[x.id]) counts[dec[x.id]]++; });
  const pending = (live || []).filter((x) => !dec[x.id] && x.check.status !== "blocked").length;
  const blocked = (live || []).filter((x) => x.check.status === "blocked");

  return (
    <>
      <div className="card approval">
        <b>🔒 Tailoring Approval Mode</b>
        <div className="msg">Your original resume is never changed. Nothing is applied until you accept it, accepted changes go into a <b>new</b> resume, and suggestions that add skills or numbers you don't have are blocked.</div>
      </div>

      <div className="card">
        <h2>1 · Job description</h2>
        <div className="two">
          <label>Tailoring
            <input value={r.name} readOnly title="Switch resume in the preview dropdown" />
          </label>
          <label>Load from application
            <select value={s.apps.some((a) => a.id === link) ? link : ""} onChange={(e) => loadApp(e.target.value)}>
              <option value="">—</option>
              {s.apps.map((a) => <option key={a.id} value={a.id}>{a.company} · {a.title}</option>)}
            </select>
          </label>
        </div>
        <textarea style={{ minHeight: 130 }} placeholder="Paste the full job description" value={jd} onChange={(e) => setJd(e.target.value)} />
        <div className="btns">
          <button disabled={!hasJd || !!busy} onClick={generate}>{busy || (live ? "Regenerate suggestions" : "Analyze & suggest changes")}</button>
          {err && <span className="msg err">{err}</span>}
        </div>
      </div>

      {gaps && (
        <div className="card">
          <h2>2 · Requirements vs your profile</h2>
          <div className="msg">Already in this resume</div>
          <div>{gaps.inResume.length ? gaps.inResume.map((x) => <span key={x.k} className="tag ok">{x.k}</span>) : <span className="msg">none</span>}</div>
          <div className="msg" style={{ marginTop: 8 }}>In your master profile, can be added honestly</div>
          <div>{gaps.inProfile.length ? gaps.inProfile.map((x) => <span key={x.k} className="tag info">{x.k}</span>) : <span className="msg">none</span>}</div>
          <div className="msg" style={{ marginTop: 8 }}>Genuine gaps: not in your profile, never added</div>
          <div>{gaps.gaps.length ? gaps.gaps.map((x) => <span key={x.k} className={`tag ${x.req ? "bad" : "warn"}`}>{x.k}{x.req ? "" : " (preferred)"}</span>) : <span className="msg">none 🎉</span>}</div>
          {gaps.gaps.length > 0 && <p className="msg">If you do have one of these, add it to your master profile first. Then it becomes allowed.</p>}
        </div>
      )}

      {live && (
        <>
          <div className="card sticky">
            <div className="btns" style={{ justifyContent: "space-between" }}>
              <span className="scorechg">
                ATS <b style={{ color: color(a0.total) }}>{a0.total}</b> → <b style={{ color: color(a1.total) }}>{a1.total}</b>
                <small className="msg"> · {counts.accept} accepted · {counts.reject} rejected · {pending} pending</small>
              </span>
              <span className="btns">
                <button className="sec small" onClick={() => setDec(Object.fromEntries(live.filter((x) => x.check.status === "ok").map((x) => [x.id, "accept"])))}>Accept all safe</button>
                <button className="sec small" onClick={() => setDec(Object.fromEntries(live.map((x) => [x.id, "reject"])))}>Reject all</button>
              </span>
            </div>
          </div>

          <div className="card">
            <h2>3 · Review suggestions ({live.length - blocked.length})</h2>
            {!live.length && <p className="msg">No changes suggested. This resume already fits well.</p>}
            {live.filter((x) => x.check.status !== "blocked").map((x) => (
              <div key={x.id} className={`sugg ${dec[x.id] || ""}`}>
                <div className="sughead">
                  <span><b>{KIND[x.kind]}</b> <small className="msg">· {x.where}</small></span>
                  <span className="sev" style={{ background: STATUS[x.check.status][1] }}>{STATUS[x.check.status][0]}</span>
                </div>
                {x.reason && <div className="msg">{x.reason}</div>}
                {x.check.note && <div className="msg" style={{ color: x.check.status === "warn" ? "var(--warn)" : undefined }}>{x.check.note}</div>}
                <div className="ba">
                  <div><small>Before</small><p>{x.before || <i className="msg">(new bullet)</i>}</p></div>
                  <div><small>After</small><p><Diff before={x.before} after={x.after} /></p></div>
                </div>
                <div className="btns">
                  <button className={dec[x.id] === "accept" ? "" : "sec"} onClick={() => setDec({ ...dec, [x.id]: dec[x.id] === "accept" ? undefined : "accept" })}>✓ Accept</button>
                  <button className={dec[x.id] === "reject" ? "danger" : "sec"} onClick={() => setDec({ ...dec, [x.id]: dec[x.id] === "reject" ? undefined : "reject" })}>✕ Reject</button>
                </div>
              </div>
            ))}
            {blocked.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary className="msg">{blocked.length} AI suggestion(s) blocked by guardrails</summary>
                {blocked.map((x) => <div key={x.id} className="issue"><div className="msg">{x.where}: {x.check.note}</div><div className="ev">{x.after}</div></div>)}
              </details>
            )}
          </div>

          <div className="card">
            <h2>4 · Save tailored resume</h2>
            <p className="msg">Creates a new resume from “{r.name}” with {accepted.length} accepted change(s). The preview on the right shows the draft.</p>
            <div className="two">
              <label>Company<input value={company} onChange={(e) => setCompany(e.target.value)} /></label>
              <label>Job title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            </div>
            <label>Save against
              <select value={link} onChange={(e) => setLink(e.target.value)}>
                <option value="">No application</option>
                <option value="new">New application (Saved)</option>
                {s.apps.map((a) => <option key={a.id} value={a.id}>{a.company} · {a.title}</option>)}
              </select>
            </label>
            <div className="btns">
              <button disabled={!accepted.length || (link === "new" && !company.trim())} onClick={save}>Create tailored resume</button>
              <button className="sec" onClick={() => setTab("score")}>Full ATS analysis</button>
              <button className="sec" disabled={!!busy} onClick={prepNotes}>Cover note & interview prep</button>
            </div>
            {notes && <Md t={notes} />}
          </div>
        </>
      )}
    </>
  );
}
