"use client";
import { useState } from "react";
import { analyze, extractJd, mergeJd } from "../lib/ats";
import { toText } from "../lib/store";
import { Ring, color, post } from "./ui";

const TYPE = { 1: "Required keywords", 2: "Preferred keywords", 3: "Skills gap", 4: "Weak verbs", 5: "Missing impact", 6: "Repetition", 7: "Relevance & title", 8: "Date format", 9: "Structure", 10: "Readability", 11: "Date consistency", 12: "Length" };
const SEV = { high: ["High", "var(--bad)"], medium: ["Medium", "var(--warn)"], low: ["Low", "var(--mute)"] };

export default function AtsPanel({ view, jd, setJd, aiJd, setAiJd }) {
  const [advice, setAdvice] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);

  const ai = aiJd[jd];
  const info = jd.trim().length > 30 ? mergeJd(extractJd(jd), ai) : null;
  const a = analyze({ d: view.d, hidden: view.hidden, resumeName: view.name, jd, jdInfo: info });

  async function runAi() {
    setErr(""); setAdvice(null);
    try {
      let lists = ai;
      if (!lists) {
        setBusy("Extracting job keywords…");
        lists = await post("/api/ats", { mode: "extract", jd });
        setAiJd((m) => ({ ...m, [jd]: lists }));
      }
      const fresh = analyze({ d: view.d, hidden: view.hidden, resumeName: view.name, jd, jdInfo: mergeJd(extractJd(jd), lists) });
      setBusy("Writing recommendations…");
      const summary = { total: fresh.total, categories: fresh.categories, missingRequired: fresh.kw?.missingReq, missingPreferred: fresh.kw?.missingPref, issues: fresh.issues.map((i) => i.text) };
      setAdvice((await post("/api/ats", { mode: "advise", jd, resume: toText(view.d, view.hidden), analysis: summary })).actions);
    } catch (e) { setErr(e.message); }
    setBusy("");
  }

  const shownIssues = open ? a.issues : a.issues.slice(0, 8);

  return (
    <>
      <div className="card">
        <h2>ATS analysis · {view.name}</h2>
        <div className="atsTop">
          <Ring n={a.total} />
          <div>
            <div className="atsLabel" style={{ color: color(a.total) }}>{a.label}</div>
            <div className="msg">
              {a.hasJd ? (info?.title ? `vs “${info.title}”` : "vs pasted job description") : "General resume quality. Paste a job description for a full match."}
            </div>
            {a.hasJd && <div className="msg">Keywords from: <b>{ai ? "AI + rules" : "rules only"}</b>{a.years && ` · Your experience ≈ ${a.years.years} yrs${a.years.need ? ` (job: ${a.years.need}+)` : ""}`}</div>}
          </div>
        </div>
        <div className="cats">
          {a.categories.map((c) => (
            <div key={c.key} className={c.pct === null ? "na" : ""}>
              <div className="catrow"><span>{c.name}</span><span>{c.pct === null ? "needs JD" : `${c.pct}%`} <small>/ {c.weight}</small></span></div>
              <div className="bar"><i style={{ width: `${c.pct ?? 0}%`, background: c.pct === null ? "var(--line)" : color(c.pct) }} /></div>
            </div>
          ))}
        </div>
        <label style={{ marginTop: 14 }}>Job description
          <textarea style={{ minHeight: 130 }} placeholder="Paste the full job description" value={jd} onChange={(e) => { setJd(e.target.value); setAdvice(null); }} />
        </label>
        <div className="btns">
          <button disabled={!a.hasJd || !!busy} onClick={runAi}>{busy || (ai ? "Get AI recommendations" : "Analyze with AI")}</button>
          {err && <span className="msg err">{err}</span>}
        </div>
        <p className="msg" style={{ marginTop: 8 }}>Scores come from JobKit's own fixed rules, so the same resume and JD always score the same. AI only extracts the job's keywords and explains. These weights are not a universal ATS standard.</p>
      </div>

      {a.kw && (
        <div className="card">
          <h2>Keywords</h2>
          {a.kw.missingReq.length > 0 && <><div className="msg">Missing required</div><div>{a.kw.missingReq.map((k) => <span key={k} className="tag bad">{k}</span>)}</div></>}
          {a.kw.missingPref.length > 0 && <><div className="msg" style={{ marginTop: 8 }}>Missing preferred</div><div>{a.kw.missingPref.map((k) => <span key={k} className="tag warn">{k}</span>)}</div></>}
          {a.kw.matched.length > 0 && <><div className="msg" style={{ marginTop: 8 }}>Matched</div><div>{a.kw.matched.map((k) => <span key={k} className="tag ok">{k}</span>)}</div></>}
          <p className="msg">Only add missing keywords you genuinely have.</p>
        </div>
      )}

      {advice && (
        <div className="card">
          <h2>AI recommended actions</h2>
          {!advice.length && <p className="msg">No further recommendations.</p>}
          {advice.map((x, i) => (
            <div className="issue" key={i}>
              <div><b>{x.action}</b></div>
              {x.evidence && <div className="ev">“{x.evidence}”</div>}
              {x.area && <small className="msg">{x.area}</small>}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Issues to fix ({a.issues.length})</h2>
        {!a.issues.length && <p className="msg">No issues found. Nice.</p>}
        {shownIssues.map((x, i) => (
          <div className="issue" key={i}>
            <div><span className="sev" style={{ background: SEV[x.sev][1] }}>{SEV[x.sev][0]}</span> <small className="msg">{TYPE[x.type]}</small></div>
            <div>{x.text}</div>
            {x.evidence.map((e, n) => <div key={n} className="ev">{e}</div>)}
          </div>
        ))}
        {a.issues.length > 8 && <button className="sec small" onClick={() => setOpen(!open)}>{open ? "Show fewer" : `Show all ${a.issues.length}`}</button>}
      </div>
    </>
  );
}
