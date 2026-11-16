"use client";
import { useEffect, useRef, useState } from "react";
import { profileYears } from "../lib/ats";
import { QCATS, RUBRIC, bankItem, needsPractice, normalizeQuestions, overall, pickMock } from "../lib/interview";
import { toText } from "../lib/store";
import { items as profileItems } from "../lib/tailor";
import { color, post } from "./ui";

const CAT = Object.fromEntries(QCATS);
const fmtSec = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// voice answers via the browser's speech recognition (Chrome/Edge); hidden where unsupported
function Mic({ onText }) {
  const [on, setOn] = useState(false);
  const rec = useRef(null);
  const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  useEffect(() => () => rec.current?.stop(), []);
  if (!SR) return null;
  function toggle() {
    if (on) { rec.current?.stop(); return; }
    const r = new SR();
    r.lang = "en-IN"; r.continuous = true; r.interimResults = false;
    r.onresult = (e) => onText([...e.results].slice(e.resultIndex).filter((x) => x.isFinal).map((x) => x[0].transcript).join(" "));
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r; r.start(); setOn(true);
  }
  return <button type="button" className={on ? "danger small" : "sec small"} onClick={toggle} aria-pressed={on}>{on ? "■ Stop" : "🎤 Speak"}</button>;
}

function AnswerBox({ value, onChange, rows = 6 }) {
  return (
    <>
      <textarea style={{ minHeight: rows * 20 }} placeholder="Type or speak your answer as you would say it in the interview" value={value} onChange={(e) => onChange(e.target.value)} />
      <Mic onText={(t) => onChange((value ? `${value} ` : "") + t.trim())} />
    </>
  );
}

function Result({ r, onSave }) {
  return (
    <div className="evalbox">
      <div className="btns" style={{ justifyContent: "space-between" }}>
        <b style={{ fontSize: 22, color: color(r.score ?? 0) }}>{r.score ?? "–"}/100</b>
        {onSave && <button className="sec small" onClick={onSave}>☆ Save to bank</button>}
      </div>
      <div className="cats" style={{ margin: "8px 0" }}>
        {RUBRIC.map(([k, l]) => {
          const v = +r.rubric?.[k]?.score || 0;
          return <div key={k} title={r.rubric?.[k]?.why || ""}><div className="catrow"><span>{l}</span><span>{v}/5</span></div><div className="bar"><i style={{ width: `${v * 20}%`, background: color(v * 20) }} /></div></div>;
        })}
      </div>
      {r.strengths?.length > 0 && <><div className="msg"><b>Strengths</b></div><ul className="tips">{r.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
      {r.improvements?.length > 0 && <><div className="msg"><b>Improve</b></div><ul className="tips">{r.improvements.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
      {r.improved && <details><summary className="msg"><b>Improved answer</b> (fill any [placeholders] with real figures)</summary><p className="ev">{r.improved}</p></details>}
    </div>
  );
}

export default function InterviewPanel({ s, setS, r, jd, flash, target, setTarget }) {
  const [sub, setSub] = useState("prep");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState({});
  const [practice, setPractice] = useState({}); // qid -> { answer, result, busy }
  const [mock, setMock] = useState(null);
  const [, setTick] = useState(0); // re-render each second for the mock timer
  const [bq, setBq] = useState({ text: "", cat: "all", weak: false });
  const [newQ, setNewQ] = useState("");

  const app = s.apps.find((a) => a.id === target);
  const key = app ? app.id : "general";
  const resume = (app && s.resumes.find((x) => x.id === app.resumeId)) || r;
  const jobJd = app ? app.desc || `${app.title} at ${app.company}` : jd;
  const prep = s.prep?.[key];
  const qs = prep?.questions || [];
  const resumeText = toText(resume.d, resume.hidden);

  useEffect(() => {
    if (!mock || mock.done) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [mock]);

  async function generate() {
    setErr(""); setBusy("Writing questions and answers from your experience…");
    const its = profileItems(s.profile, s.profile).list;
    if (!its.length) { setErr("Add experience bullets to your master profile first, so answers can be based on your real work."); setBusy(""); return; }
    const base = { mode: "questions", jd: jobJd, title: app?.title || resume.name, company: app?.company || "", name: s.profile.name, years: Math.round(profileYears(s.profile)), skills: s.profile.skills, summary: s.profile.summary, items: its };
    const res = await Promise.allSettled(["tech", "people"].map((part) => post("/api/interview", { ...base, part })));
    const raw = res.flatMap((x) => (x.status === "fulfilled" ? x.value.questions : []));
    const failed = res.filter((x) => x.status === "rejected");
    if (failed.length) setErr(`Part of the set failed: ${failed[0].reason?.message}. You can regenerate.`);
    const questions = normalizeQuestions(raw, its);
    if (questions.length) setS((p) => ({ ...p, prep: { ...(p.prep || {}), [key]: { questions, at: new Date().toISOString(), title: base.title, company: base.company } } }));
    setBusy("");
  }

  async function evaluate(q, answer) {
    const res = await post("/api/interview", { mode: "evaluate", q: q.q, category: q.category, answer, resume: resumeText, jd: jobJd });
    return { ...res, score: overall(res.rubric) };
  }

  function saveToBank(q, extra = {}) {
    if ((s.bank || []).some((b) => b.q.trim().toLowerCase() === q.q.trim().toLowerCase())) return flash("Already in your question bank.");
    setS((p) => ({ ...p, bank: [bankItem(q, { company: app?.company || "", title: app?.title || "", ...extra }), ...(p.bank || [])] }));
    flash("Saved to your question bank.");
  }

  async function runPractice(q) {
    const cur = practice[q.id] || {};
    setPractice((p) => ({ ...p, [q.id]: { ...cur, busy: true, error: "" } }));
    try {
      const result = await evaluate(q, cur.answer);
      setPractice((p) => ({ ...p, [q.id]: { ...p[q.id], result, busy: false } }));
    } catch (e) { setPractice((p) => ({ ...p, [q.id]: { ...p[q.id], busy: false, error: e.message } })); }
  }

  // ---- mock interview ----
  function startMock() {
    const picked = pickMock(qs, 6);
    if (!picked.length) return setErr("Generate questions first.");
    setMock({ qs: picked, i: 0, answer: "", results: [], started: Date.now(), qStart: Date.now(), done: false, busy: false });
    setSub("mock");
  }
  async function submitMock(skip = false) {
    const m0 = mock; // inputs are disabled while busy, so this snapshot stays current
    const q = m0.qs[m0.i];
    const secs = Math.round((Date.now() - m0.qStart) / 1000);
    setMock({ ...m0, busy: true });
    let result = null;
    if (!skip && m0.answer.trim()) { try { result = await evaluate(q, m0.answer); } catch (e) { result = { error: e.message, score: null }; } }
    const results = [...m0.results, { q, answer: skip ? "" : m0.answer, secs, result }];
    const done = m0.i + 1 >= m0.qs.length;
    if (done) {
      const scored = results.filter((x) => x.result?.score != null);
      const avg = scored.length ? Math.round(scored.reduce((a, x) => a + x.result.score, 0) / scored.length) : null;
      const rec = { id: String(Date.now()), at: new Date().toISOString(), key, title: app ? `${app.title} · ${app.company}` : resume.name, avg, items: results.map((x) => ({ q: x.q.q, category: x.q.category, score: x.result?.score ?? null, secs: x.secs })) };
      setS((p) => ({ ...p, mocks: [rec, ...(p.mocks || [])].slice(0, 20) }));
    }
    setMock({ ...m0, results, i: done ? m0.i : m0.i + 1, answer: "", qStart: Date.now(), done, busy: false });
  }

  const shown = qs.filter((q) => cat === "all" || q.category === cat);
  const bank = (s.bank || []).filter((b) => (bq.cat === "all" || b.category === bq.cat) && (!bq.weak || needsPractice(b)) && (!bq.text || `${b.q} ${b.topic} ${b.company}`.toLowerCase().includes(bq.text.toLowerCase())));
  const updBank = (id, fn) => setS((p) => ({ ...p, bank: p.bank.map((b) => (b.id === id ? fn(b) : b)) }));
  const mockAvg = (k) => { const v = mock.results.map((x) => +x.result?.rubric?.[k]?.score).filter(Boolean); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

  return (
    <>
      <div className="card">
        <div className="btns" style={{ justifyContent: "space-between" }}>
          <label style={{ flex: 1, minWidth: 240 }}>Prepare for
            <select value={key} onChange={(e) => { setTarget(e.target.value === "general" ? "" : e.target.value); setMock(null); }}>
              <option value="general">General: “{r.name}” + job description from ATS/Tailor</option>
              {s.apps.filter((a) => a.status !== "rejected" && a.status !== "withdrawn").map((a) => <option key={a.id} value={a.id}>{a.company} · {a.title}{a.status === "interview" ? " (interviewing)" : ""}</option>)}
            </select>
          </label>
          <div className="tabs sub">
            {[["prep", `Questions${qs.length ? ` (${qs.length})` : ""}`], ["mock", "Mock interview"], ["bank", `Question bank (${(s.bank || []).length})`]].map(([k, l]) => <button key={k} className={sub === k ? "on" : ""} onClick={() => setSub(k)}>{l}</button>)}
          </div>
        </div>
        <p className="msg">Answers use resume “{resume.name}” and your master profile. {app?.interviews?.length ? `Upcoming/past rounds: ${app.interviews.map((i) => i.round || "Interview").join(", ")}.` : ""}{!app && !jd.trim() ? " Tip: paste a job description in the ATS or Tailor tab for sharper questions." : ""}</p>
        {err && <p className="msg err">{err}</p>}
      </div>

      {sub === "prep" && (
        <div className="card">
          <div className="btns" style={{ justifyContent: "space-between" }}>
            <div>{[["all", "All"], ...QCATS].map(([k, l]) => <button key={k} className={`chip small ${cat === k ? "on" : ""}`} onClick={() => setCat(k)}>{l}</button>)}</div>
            <span className="btns">
              <button disabled={!!busy} onClick={generate}>{busy ? "Generating…" : qs.length ? "Regenerate" : "Generate questions"}</button>
              <button className="sec" disabled={!qs.length || !!busy} onClick={startMock}>Start mock</button>
            </span>
          </div>
          {busy && <p className="msg">{busy} (about 20–40 seconds)</p>}
          {!qs.length && !busy && <p className="msg">About 23 questions: 6 technical from the job, 6 stack deep-dives (C#, .NET, React, SQL…), 4 scenarios, 2 system design and 5 HR, each with a suggested answer based on your real experience.</p>}
          {prep && <p className="msg">Generated {new Date(prep.at).toLocaleString()}.</p>}
          {shown.map((q) => {
            const pr = practice[q.id] || {};
            return (
              <div className="qcard" key={q.id}>
                <div className="sughead">
                  <span><span className="tag info">{CAT[q.category]}</span>{q.topic && <span className="tag">{q.topic}</span>}<span className={`tag ${q.difficulty === "hard" ? "bad" : q.difficulty === "easy" ? "ok" : "warn"}`}>{q.difficulty}</span></span>
                  <button className="icon" title="Save to question bank" aria-label="Save to question bank" onClick={() => saveToBank(q)}>☆</button>
                </div>
                <div className="qtext">{q.q}</div>
                {q.why && <div className="msg">Testing: {q.why}</div>}
                <div className="btns" style={{ marginTop: 6 }}>
                  <button className="sec small" onClick={() => setOpen({ ...open, [q.id]: !open[q.id] })}>{open[q.id] ? "Hide" : "Show"} suggested answer</button>
                  <button className="sec small" onClick={() => setPractice({ ...practice, [q.id]: pr.show ? { ...pr, show: false } : { ...pr, show: true } })}>Practise</button>
                </div>
                {open[q.id] && (
                  <div className="ans">
                    {q.gap && <div className="msg err">No direct match in your profile. The answer is honest about that; prepare a related example.</div>}
                    <p>{q.answer}</p>
                    <div className="msg">Say only what you really did. Change any detail here that doesn't match your actual work.</div>
                    {q.evidence.length > 0 && <div className="msg">Based on: {q.evidence.map((e) => <div key={e.id} className="ev">{e.where}: {e.text}</div>)}</div>}
                    {q.followups.length > 0 && <div className="msg">Likely follow-ups: {q.followups.join(" · ")}</div>}
                  </div>
                )}
                {pr.show && (
                  <div className="ans">
                    <AnswerBox value={pr.answer || ""} onChange={(v) => setPractice((p) => ({ ...p, [q.id]: { ...p[q.id], answer: v } }))} />
                    <button className="small" style={{ marginLeft: 6 }} disabled={pr.busy || !pr.answer?.trim()} onClick={() => runPractice(q)}>{pr.busy ? "Evaluating…" : "Evaluate"}</button>
                    {pr.error && <p className="msg err">{pr.error}</p>}
                    {pr.result && <Result r={pr.result} onSave={() => saveToBank(q, { myAnswer: pr.answer, attempts: [{ at: new Date().toISOString(), score: pr.result.score, answer: pr.answer }] })} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sub === "mock" && (
        <div className="card">
          {!mock && (
            <>
              <h2>Mock interview</h2>
              <p className="msg">6 questions across categories, hardest first, one at a time with a timer. Each answer gets a rubric score, and you get a summary at the end.</p>
              <button disabled={!qs.length} onClick={startMock}>{qs.length ? "Start mock interview" : "Generate questions first (Questions tab)"}</button>
              {(s.mocks || []).length > 0 && <>
                <h2 style={{ marginTop: 16 }}>Past mocks</h2>
                {s.mocks.map((m) => <div className="ver" key={m.id}><span><b>{m.title}</b><br /><small>{new Date(m.at).toLocaleString()} · {m.items.length} questions</small></span><b style={{ color: color(m.avg ?? 0) }}>{m.avg ?? "–"}</b></div>)}
              </>}
            </>
          )}
          {mock && !mock.done && (() => {
            const q = mock.qs[mock.i];
            return (
              <>
                <div className="btns" style={{ justifyContent: "space-between" }}>
                  <b>Question {mock.i + 1} of {mock.qs.length}</b>
                  <span className="msg" aria-live="off">⏱ {fmtSec(Math.round((Date.now() - mock.qStart) / 1000))}</span>
                </div>
                <div className="bar" style={{ margin: "6px 0 12px" }}><i style={{ width: `${(mock.i / mock.qs.length) * 100}%`, background: "var(--brand)" }} /></div>
                <span className="tag info">{CAT[q.category]}</span>{q.topic && <span className="tag">{q.topic}</span>}
                <div className="qtext" style={{ fontSize: 17, margin: "10px 0" }}>{q.q}</div>
                <AnswerBox rows={8} value={mock.answer} onChange={(v) => setMock((m) => ({ ...m, answer: v }))} />
                <div className="btns" style={{ marginTop: 8 }}>
                  <button disabled={mock.busy || !mock.answer.trim()} onClick={() => submitMock(false)}>{mock.busy ? "Evaluating…" : mock.i + 1 === mock.qs.length ? "Submit & finish" : "Submit & next"}</button>
                  <button className="sec" disabled={mock.busy} onClick={() => submitMock(true)}>Skip</button>
                  <button className="danger small" disabled={mock.busy} onClick={() => confirm("End this mock interview?") && setMock(null)}>End</button>
                </div>
                <p className="msg">Aim for 1–2 minutes per answer. Speak naturally; the mic works in Chrome and Edge.</p>
              </>
            );
          })()}
          {mock?.done && (() => {
            const scored = mock.results.filter((x) => x.result?.score != null);
            const avg = scored.length ? Math.round(scored.reduce((a, x) => a + x.result.score, 0) / scored.length) : null;
            const weakest = RUBRIC.map(([k, l]) => [l, mockAvg(k)]).filter(([, v]) => v != null).sort((a, b) => a[1] - b[1]).slice(0, 2);
            return (
              <>
                <h2>Mock interview result: <span style={{ color: color(avg ?? 0) }}>{avg ?? "–"}/100</span></h2>
                {weakest.length > 0 && <p className="msg">Weakest areas: {weakest.map(([l, v]) => `${l} (${v.toFixed(1)}/5)`).join(", ")}</p>}
                {mock.results.map((x, i) => (
                  <details className="qcard" key={i}>
                    <summary><b style={{ color: color(x.result?.score ?? 0) }}>{x.result?.score ?? (x.answer ? "!" : "skipped")}</b> · {x.q.q} <small className="msg">({fmtSec(x.secs)})</small></summary>
                    {x.answer && <p className="ev">{x.answer}</p>}
                    {x.result?.error && <p className="msg err">{x.result.error}</p>}
                    {x.result?.rubric && <Result r={x.result} onSave={() => saveToBank(x.q, { myAnswer: x.answer, attempts: [{ at: new Date().toISOString(), score: x.result.score, answer: x.answer }] })} />}
                    {!x.answer && <button className="sec small" onClick={() => saveToBank(x.q)}>☆ Save to bank</button>}
                  </details>
                ))}
                <div className="btns">
                  <button onClick={() => { mock.results.filter((x) => (x.result?.score ?? 0) < 60).forEach((x) => saveToBank(x.q, { myAnswer: x.answer })); }}>Save all under 60 to bank</button>
                  <button className="sec" onClick={startMock}>New mock</button>
                  <button className="sec" onClick={() => setMock(null)}>Done</button>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {sub === "bank" && (
        <div className="card">
          <div className="btns">
            <input style={{ maxWidth: 240, margin: 0 }} placeholder="Search questions" value={bq.text} onChange={(e) => setBq({ ...bq, text: e.target.value })} />
            <select style={{ width: "auto", margin: 0 }} value={bq.cat} onChange={(e) => setBq({ ...bq, cat: e.target.value })}><option value="all">All categories</option>{QCATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <label className="check"><input type="checkbox" checked={bq.weak} onChange={(e) => setBq({ ...bq, weak: e.target.checked })} />Needs practice</label>
          </div>
          <div className="inline" style={{ marginTop: 8 }}>
            <input placeholder="Add a question you were asked or found hard" value={newQ} onChange={(e) => setNewQ(e.target.value)} />
            <button className="small" disabled={newQ.trim().length < 8} onClick={() => { saveToBank({ q: newQ.trim(), category: "technical" }); setNewQ(""); }}>Add</button>
          </div>
          {!bank.length && <p className="msg">No questions here yet. Use ☆ on any question, or add your own.</p>}
          {bank.map((b) => {
            const last = b.attempts[b.attempts.length - 1];
            const pr = practice[b.id] || {};
            return (
              <div className="qcard" key={b.id}>
                <div className="sughead">
                  <span><span className="tag info">{CAT[b.category]}</span>{b.topic && <span className="tag">{b.topic}</span>}{b.company && <small className="msg"> · {b.company}</small>}</span>
                  <span className="btns">
                    {last ? <b style={{ color: color(last.score ?? 0) }}>{last.score ?? "–"}</b> : <small className="msg">not practised</small>}
                    <button className="icon" aria-label="Delete question" onClick={() => confirm("Remove this question from the bank?") && setS((p) => ({ ...p, bank: p.bank.filter((x) => x.id !== b.id) }))}>✕</button>
                  </span>
                </div>
                <div className="qtext">{b.q}</div>
                {b.attempts.length > 1 && <div className="msg">Scores: {b.attempts.map((a) => a.score ?? "–").join(" → ")}</div>}
                <div className="btns" style={{ marginTop: 6 }}>
                  {b.hint && <button className="sec small" onClick={() => setOpen({ ...open, [b.id]: !open[b.id] })}>{open[b.id] ? "Hide" : "Show"} suggested answer</button>}
                  <button className="sec small" onClick={() => setPractice({ ...practice, [b.id]: { ...pr, show: !pr.show, answer: pr.answer ?? b.myAnswer } })}>Practise</button>
                </div>
                {open[b.id] && <p className="ans">{b.hint}</p>}
                <label style={{ marginTop: 6 }}>My notes<textarea style={{ minHeight: 50 }} value={b.notes} onChange={(e) => updBank(b.id, (x) => ({ ...x, notes: e.target.value }))} /></label>
                {pr.show && (
                  <div className="ans">
                    <AnswerBox value={pr.answer || ""} onChange={(v) => setPractice((p) => ({ ...p, [b.id]: { ...p[b.id], answer: v } }))} />
                    <button className="small" style={{ marginLeft: 6 }} disabled={pr.busy || !pr.answer?.trim()} onClick={async () => {
                      setPractice((p) => ({ ...p, [b.id]: { ...p[b.id], busy: true, error: "" } }));
                      try {
                        const result = await evaluate(b, pr.answer);
                        updBank(b.id, (x) => ({ ...x, myAnswer: pr.answer, attempts: [...x.attempts, { at: new Date().toISOString(), score: result.score, answer: pr.answer }] }));
                        setPractice((p) => ({ ...p, [b.id]: { ...p[b.id], busy: false, result } }));
                      } catch (e) { setPractice((p) => ({ ...p, [b.id]: { ...p[b.id], busy: false, error: e.message } })); }
                    }}>{pr.busy ? "Evaluating…" : "Evaluate"}</button>
                    {pr.error && <p className="msg err">{pr.error}</p>}
                    {pr.result && <Result r={pr.result} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
