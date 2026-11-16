"use client";
import { useEffect, useRef, useState } from "react";
import AtsPanel from "./ats-panel";
import TailorPanel from "./tailor-panel";
import { SECTIONS, TEMPLATES, addVersion, clean, due, load, newResume, save, toText } from "../lib/store";
import { Editor, Sheet, fitOnePage, post } from "./ui";
import Apps from "./apps";
import JobsPanel from "./jobs-panel";
import InterviewPanel from "./interview-panel";
import AgentPanel from "./agent-panel";
import AnalyticsPanel from "./analytics-panel";
import LinkedInPanel from "./linkedin-panel";

const PRESETS = [".NET Full Stack Developer", "React Full Stack Developer", "AI Full Stack Developer", "Agentic AI Engineer", "Node.js Developer", "Python Backend Developer"];
const TABS = [["profile", "Master profile"], ["resumes", "Resumes"], ["score", "ATS"], ["tailor", "Tailor"], ["jobs", "Jobs"], ["apps", "Applications"], ["interview", "Interview"], ["agent", "✨ Agent"], ["linkedin", "LinkedIn"], ["stats", "Analytics"]];

async function fileToText(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt")) return file.text();
  if (name.endsWith(".docx")) {
    const m = await import("mammoth/mammoth.browser");
    return (await (m.default || m).extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  }
  if (name.endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    let t = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const c = await (await pdf.getPage(p)).getTextContent();
      t += c.items.map((it) => it.str + (it.hasEOL ? "\n" : " ")).join("") + "\n";
    }
    return t;
  }
  throw new Error("Use a PDF, DOCX or TXT file");
}

export default function Home() {
  const [s, setS] = useState(null);
  const [tab, setTab] = useState("resumes");
  const [jd, setJd] = useState("");
  const [aiJd, setAiJd] = useState({}); // JD text -> AI keyword lists, shared by ATS and Tailor so scores agree
  const [draft, setDraft] = useState(null);
  const [prepFor, setPrepFor] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [newName, setNewName] = useState("");
  const [verLabel, setVerLabel] = useState("");
  const [saveFail, setSaveFail] = useState(false);

  const sheetRef = useRef(null);
  const [fit, setFit] = useState({ zoom: 1, fits: true });
  useEffect(() => { setS(load()); }, []);
  useEffect(() => { if (s) setSaveFail(!save(s)); }, [s]);
  // re-measure the one-page fit shortly after the previewed resume changes
  useEffect(() => {
    const t = setTimeout(() => { const f = fitOnePage(sheetRef.current); setFit((o) => (o.zoom === f.zoom && o.fits === f.fits ? o : f)); }, 250);
    return () => clearTimeout(t);
  });
  if (!s) return null;

  const r = s.resumes.find((x) => x.id === s.active) || s.resumes[0];
  const view = tab === "profile" ? { name: "Master profile", d: s.profile, template: r.template, hidden: [] }
    : tab === "tailor" && draft ? { ...r, name: `${r.name} (tailored draft)`, d: draft } : r;

  const setApps = (fn) => setS((p) => ({ ...p, apps: fn(p.apps) }));
  const dueCount = due(s.apps).length;
  const updR = (fn) => setS((p) => ({ ...p, resumes: p.resumes.map((x) => (x.id === r.id ? fn(x) : x)) }));
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  async function upload(file) {
    if (!file) return;
    setBusy("upload"); setMsg("");
    try {
      if (file.size > 4 * 1024 * 1024) throw new Error("File is over 4 MB");
      const { resume } = await post("/api/parse", { text: await fileToText(file) });
      const profile = clean(resume);
      // first import also fills resumes that are still blank
      setS((p) => ({ ...p, profile, resumes: p.resumes.map((x) => (x.d.name ? x : { ...x, d: clean(resume) })) }));
      flash("Profile imported. Check it below, then create role resumes in the Resumes tab.");
    } catch (e) { setMsg(e.message || "Upload failed"); }
    setBusy("");
  }

  async function createResume(name) {
    name = name.trim();
    if (!name) return;
    const nr = newResume(name, s.profile);
    setS((p) => ({ ...p, resumes: [...p.resumes, nr], active: nr.id }));
    setNewName(""); setTab("resumes");
    if (!s.profile.name && !s.profile.summary) return flash("Created. Fill your master profile first to get AI tailoring.");
    setBusy("create");
    try {
      const { summary, skills } = await post("/api/improve", { mode: "role", role: name, profile: toText(s.profile) });
      setS((p) => ({ ...p, resumes: p.resumes.map((x) => (x.id === nr.id ? { ...x, d: { ...x.d, summary: summary || x.d.summary, skills: skills || x.d.skills } } : x)) }));
      flash(`"${name}" created with a tailored summary and skills.`);
    } catch (e) { flash(`Created from master profile (AI tailoring failed: ${e.message})`); }
    setBusy("");
  }

  function removeResume() {
    if (s.resumes.length === 1) return flash("Keep at least one resume.");
    if (!confirm(`Delete "${r.name}" and its versions?`)) return;
    setS((p) => { const rest = p.resumes.filter((x) => x.id !== r.id); return { ...p, resumes: rest, active: rest[0].id }; });
  }

  function backup() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(s, null, 2)], { type: "application/json" }));
    Object.assign(document.createElement("a"), { href: url, download: `jobkit-backup-${new Date().toISOString().slice(0, 10)}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function restore(file) {
    if (!file) return;
    try {
      const b = JSON.parse(await file.text());
      if (!b?.profile || !Array.isArray(b.resumes) || !b.resumes.length) throw new Error();
      if (!confirm("Replace everything in this browser with this backup?")) return;
      setS({ ...b, active: b.resumes.some((x) => x.id === b.active) ? b.active : b.resumes[0].id });
      flash("Backup restored.");
    } catch { flash("That file is not a JobKit backup."); }
  }

  function printPdf() {
    const t = document.title;
    document.title = `${view.d.name || "Resume"} - ${view.name}`; // becomes the PDF file name
    window.print();
    document.title = t;
  }
  async function docx() {
    const { exportDocx } = await import("../lib/docx");
    const base = view.template === "compact" ? 9.5 : 10.5; // template body size in pt, as in globals.css
    exportDocx(view.d, view.hidden, `${view.d.name || "Resume"} - ${view.name}`, base * fit.zoom);
  }



  return (
    <>
      <div className="top"><b>JobKit</b><span>Personal AI career workspace</span></div>
      <div className="tabs main">
        {TABS.map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {l}{k === "apps" && dueCount > 0 && <span className="badge">{dueCount}</span>}
          </button>
        ))}
      </div>
      <div className={`wrap ${["apps", "jobs", "interview", "agent", "stats", "linkedin"].includes(tab) ? "full" : ""}`}>
        <div className="left">
          {msg && <div className="note">{msg}</div>}
          {saveFail && <div className="note err">Browser storage is full or blocked. Download a backup now.</div>}

          {tab === "profile" && (
            <>
              <div className="card">
                <h2>Master career profile</h2>
                <p className="msg">Keep everything here: all jobs, projects, skills. Role resumes are generated from it.</p>
                <label className="drop">
                  <input type="file" accept=".pdf,.docx,.txt" onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} />
                  {busy === "upload" ? "Reading your resume…" : <><b>Import an existing resume</b><br />PDF, DOCX or TXT (max 4 MB)</>}
                </label>
              </div>
              <Editor d={s.profile} role="software developer" onChange={(d) => setS((p) => ({ ...p, profile: d }))} />
            </>
          )}

          {tab === "resumes" && (
            <>
              <div className="card">
                <h2>Your resumes</h2>
                <div>{s.resumes.map((x) => (
                  <button key={x.id} className={`chip ${x.id === r.id ? "on" : ""}`} onClick={() => setS((p) => ({ ...p, active: x.id }))}>{x.name}</button>
                ))}</div>
                <h2 style={{ marginTop: 12 }}>New resume from master profile</h2>
                <div>{PRESETS.filter((n) => !s.resumes.some((x) => x.name === n)).map((n) => (
                  <button key={n} className="chip" disabled={!!busy} onClick={() => createResume(n)}>+ {n}</button>
                ))}</div>
                <div className="inline">
                  <input placeholder="Or type a target role" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createResume(newName)} />
                  <button disabled={!!busy || !newName.trim()} onClick={() => createResume(newName)}>{busy === "create" ? "Tailoring…" : "Create"}</button>
                </div>
              </div>

              <div className="card">
                <h2>Settings: {r.name}</h2>
                <label>Resume name<input value={r.name} onChange={(e) => updR((x) => ({ ...x, name: e.target.value }))} /></label>
                <label>Template</label>
                <div>{TEMPLATES.map(([k, l]) => (
                  <button key={k} className={`chip ${r.template === k ? "on" : ""}`} onClick={() => updR((x) => ({ ...x, template: k }))}>{l}</button>
                ))}</div>
                <label style={{ marginTop: 8 }}>Show sections</label>
                <div className="checks">{SECTIONS.map((k) => (
                  <label key={k} className="check">
                    <input type="checkbox" checked={!r.hidden.includes(k)}
                      onChange={(e) => updR((x) => ({ ...x, hidden: e.target.checked ? x.hidden.filter((h) => h !== k) : [...x.hidden, k] }))} />
                    {k}
                  </label>
                ))}</div>
                <div className="btns">
                  <button className="sec" onClick={() => { const c = { ...newResume(`${r.name} (copy)`, r.d), template: r.template, hidden: [...r.hidden] }; setS((p) => ({ ...p, resumes: [...p.resumes, c], active: c.id })); }}>Duplicate</button>
                  <button className="sec" onClick={() => confirm("Replace this resume's content with the master profile? Save a version first if needed.") && updR((x) => ({ ...newResume(x.name, s.profile), id: x.id, template: x.template, hidden: x.hidden, versions: x.versions }))}>Reset from master</button>
                  <button className="danger" onClick={removeResume}>Delete</button>
                </div>
              </div>

              <div className="card">
                <h2>Versions</h2>
                <div className="inline">
                  <input placeholder="Label, e.g. Sent to Infosys" value={verLabel} onChange={(e) => setVerLabel(e.target.value)} />
                  <button onClick={() => { updR((x) => addVersion(x, verLabel.trim())); setVerLabel(""); flash("Version saved."); }}>Save version</button>
                </div>
                {!r.versions.length && <p className="msg">No saved versions yet.</p>}
                {r.versions.map((v, i) => (
                  <div className="ver" key={v.at + i}>
                    <span><b>{v.label}</b><br /><small>{new Date(v.at).toLocaleString()}</small></span>
                    <span>
                      <button className="sec small" onClick={() => confirm(`Restore "${v.label}"? Unsaved changes are lost.`) && updR((x) => ({ ...x, d: JSON.parse(JSON.stringify(v.d)) }))}>Restore</button>{" "}
                      <button className="icon" aria-label="Delete version" onClick={() => updR((x) => ({ ...x, versions: x.versions.filter((_, n) => n !== i) }))}>✕</button>
                    </span>
                  </div>
                ))}
              </div>

              <Editor d={r.d} role={r.name} onChange={(d) => updR((x) => ({ ...x, d }))} />

              <div className="card">
                <h2>Backup</h2>
                <p className="msg">Everything is stored in this browser only. Download a backup now and then.</p>
                <div className="btns">
                  <button className="sec" onClick={backup}>Download backup</button>
                  <label className="filebtn">Restore backup<input type="file" accept=".json" onChange={(e) => { restore(e.target.files[0]); e.target.value = ""; }} /></label>
                </div>
              </div>
            </>
          )}

          {/* kept mounted so AI keyword lists stay cached and scores stay stable across tab switches */}
          <div hidden={tab !== "score"}><AtsPanel view={view} jd={jd} setJd={setJd} aiJd={aiJd} setAiJd={setAiJd} /></div>

          <div hidden={tab !== "tailor"}>
            <TailorPanel s={s} setS={setS} r={r} jd={jd} setJd={setJd} aiJd={aiJd} setAiJd={setAiJd} setDraft={setDraft} setTab={setTab} flash={flash} />
          </div>

          {tab === "jobs" && <JobsPanel s={s} setS={setS} r={r} setJd={setJd} setTab={setTab} flash={flash} />}

          {tab === "interview" && <InterviewPanel s={s} setS={setS} r={r} jd={jd} flash={flash} target={prepFor} setTarget={setPrepFor} />}

          {/* kept mounted so the conversation survives when an approved action opens another tab */}
          {tab === "stats" && <AnalyticsPanel s={s} />}
          {tab === "linkedin" && <LinkedInPanel s={s} setS={setS} presets={PRESETS} fileToText={fileToText} />}
          <div hidden={tab !== "agent"}><AgentPanel s={s} setS={setS} r={r} setJd={setJd} setTab={setTab} setPrepFor={setPrepFor} /></div>

          {tab === "apps" && (
            <Apps apps={s.apps} setApps={setApps} resumes={s.resumes} activeResumeId={r.id} profileName={s.profile.name} onPrep={(id) => { setPrepFor(id); setTab("interview"); }} />
          )}
        </div>

        {!["apps", "jobs", "interview", "agent", "stats", "linkedin"].includes(tab) && <div className="preview">
          <div className="ptitle">
            {tab === "profile" ? <b>Master profile preview</b> : (
              <select aria-label="Resume to preview" value={r.id} onChange={(e) => setS((p) => ({ ...p, active: e.target.value }))}>
                {s.resumes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            )}
            <span className="btns">
              <button onClick={printPdf}>PDF</button>
              <button className="sec" onClick={docx}>DOCX</button>
            </span>
          </div>
          <div className={`fitnote ${fit.fits ? "" : "err"}`}>
            {fit.fits ? `✓ Fits on one A4 page${fit.zoom < 1 ? ` (text scaled to ${Math.round(fit.zoom * 100)}%)` : ""}`
              : "Too long for one page even at the smallest readable size. Hide a section or trim older bullets, or it will print on 2 pages."}
          </div>
          <Sheet d={view.d} template={view.template} hidden={view.hidden} fit={fit.zoom} sheetRef={sheetRef} />
        </div>}
      </div>
    </>
  );
}
