"use client";
import { useMemo, useState } from "react";
import { checkUrl, dailyTasks, emptyLi, liScore, streak } from "../lib/linkedin";
import { today, toText } from "../lib/store";
import { Bar, Ring, color, post } from "./ui";

const NUMBERS = [["connections", "Connections"], ["followers", "Followers"], ["postsLast30", "Posts (last 30 days)"], ["commentsLast30", "Comments (last 30 days)"], ["featured", "Featured items"], ["recommendations", "Recommendations received"]];
const TOGGLES = [["photo", "Profile photo"], ["banner", "Custom banner"], ["openToWork", "Open to work on"], ["contactInfo", "Email in contact info"]];

export default function LinkedInPanel({ s, setS, presets, fileToText }) {
  const li = { ...emptyLi, ...(s.linkedin || {}) };
  const set = (patch) => setS((p) => ({ ...p, linkedin: { ...emptyLi, ...(p.linkedin || {}), ...patch } }));
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [heads, setHeads] = useState([]);
  const [aboutDraft, setAboutDraft] = useState("");
  const [postDraft, setPostDraft] = useState("");

  const sc = useMemo(() => liScore(li, s.profile.skills), [s.linkedin, s.profile.skills]); // eslint-disable-line react-hooks/exhaustive-deps
  const day = today();
  const companies = [...new Set(s.apps.filter((a) => ["saved", "applied"].includes(a.status)).map((a) => a.company).filter(Boolean))];
  const mySkills = s.profile.skills.split(",").map((x) => x.trim()).filter(Boolean);
  const tasks = dailyTasks(sc, { date: day, companies, skills: mySkills.slice(0, 6), role: li.role });
  const log = s.liLog || {};
  const doneIds = log[day]?.ids || {};
  const toggle = (id) => setS((p) => {
    const ids = { ...((p.liLog || {})[day]?.ids || {}), [id]: !doneIds[id] };
    return { ...p, liLog: { ...(p.liLog || {}), [day]: { ids, total: tasks.length, done: tasks.filter((t) => ids[t.id]).length } } };
  });
  const days = streak(log, day);
  const url = checkUrl(li.url);
  const profileText = toText(s.profile);

  async function run(mode, extra, onOk) {
    setBusy(mode); setErr("");
    try { onOk(await post("/api/linkedin", { mode, role: li.role, profile: profileText, ...extra })); } catch (e) { setErr(e.message); }
    setBusy("");
  }
  async function importPdf(file) {
    if (!file) return;
    setBusy("import"); setErr("");
    try {
      const text = await fileToText(file);
      const r = await post("/api/linkedin", { mode: "import", text });
      const pick = (k) => (typeof r[k] === "string" ? r[k] : "");
      set({ headline: pick("headline"), about: pick("about"), location: pick("location"), skills: pick("skills").split(",").map((x) => x.trim()).filter((x) => x && !/^(top )?skills$/i.test(x)).join(", "), certifications: pick("certifications"), education: pick("education"),
        experience: Array.isArray(r.experience) ? r.experience.slice(0, 15).map((e) => ({ title: String(e.title || ""), company: String(e.company || ""), dates: String(e.dates || ""), description: String(e.description || "") })) : [] });
    } catch (e) { setErr(e.message); }
    setBusy("");
  }

  const fixes = sc.checks.filter((c) => c.pass < 1).sort((a, b) => b.weight * (1 - b.pass) - a.weight * (1 - a.pass));

  return (
    <>
      <div className="card">
        <h2>LinkedIn profile booster</h2>
        <p className="msg">LinkedIn doesn't let apps read a profile from its link, so import the PDF LinkedIn gives you: open your profile → <b>Resources</b> (or <b>More</b>) → <b>Save to PDF</b>. Then fill in the few numbers only you can see.</p>
        <div className="two">
          <label>Your LinkedIn link
            <input value={li.url} placeholder="https://www.linkedin.com/in/your-name" onChange={(e) => set({ url: e.target.value })} />
            {li.url && <span className={`msg ${url.ok ? "" : "err"}`}>{!url.ok ? "That doesn't look like a linkedin.com/in/… profile link." : url.custom ? "✓ Custom URL" : "Uses LinkedIn's random suffix; customise it."}{url.ok && <> · <a href={li.url.startsWith("http") ? li.url : `https://${li.url}`} target="_blank" rel="noopener noreferrer">open</a></>}</span>}
          </label>
          <label>Target role
            <select value={li.role} onChange={(e) => set({ role: e.target.value })}>
              <option value="">Choose…</option>
              {presets.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
        </div>
        <label className="drop">
          <input type="file" accept=".pdf" onChange={(e) => { importPdf(e.target.files[0]); e.target.value = ""; }} />
          {busy === "import" ? "Reading your LinkedIn PDF…" : <><b>Import LinkedIn “Save to PDF” file</b><br />Fills headline, About, experience, skills and certifications</>}
        </label>
        {err && <div className="msg err">{err}</div>}
      </div>

      <div className="two">
        <div className="card">
          <h2>Profile score</h2>
          <div className="ringbox">
            <Ring n={sc.total} />
            <div><b style={{ color: color(sc.total) }}>{sc.label}</b><p className="msg">Rule-based: 23 checks across 8 areas. Same profile, same score.</p></div>
          </div>
          <div className="bars">{sc.cats.map((c) => <Bar key={c.cat} label={c.cat} n={c.pct} />)}</div>
        </div>
        <div className="card">
          <h2>Today's tasks <span className="msg" style={{ fontWeight: 400 }}>{days > 0 ? `🔥 ${days}-day streak` : "Finish all 3 to start a streak"}</span></h2>
          {tasks.map((t) => (
            <label key={t.id} className="task">
              <input type="checkbox" checked={!!doneIds[t.id]} onChange={() => toggle(t.id)} />
              <span><small>{t.kind}{t.gain ? ` · +${t.gain} pts` : ""}</small><br />{t.text}</span>
            </label>
          ))}
          {tasks.some((t) => t.cat === "post" || t.id === "fix-post") && (
            <div style={{ marginTop: 10 }}>
              <button className="sec small" disabled={busy === "post"} onClick={() => run("post", { topic: s.profile.projects.split("\n")[0] || s.profile.jobs[0]?.bullets.split("\n")[0] || "" }, (r) => setPostDraft(r.text || ""))}>{busy === "post" ? "Drafting…" : "✨ Draft a post from my top project"}</button>
              {postDraft && <><textarea value={postDraft} onChange={(e) => setPostDraft(e.target.value)} rows={8} /><button className="sec small" onClick={() => navigator.clipboard.writeText(postDraft)}>Copy</button></>}
            </div>
          )}
          <p className="msg" style={{ color: "var(--mute)" }}>New tasks every day. Do them on LinkedIn, then tick them here.</p>
        </div>
      </div>

      {fixes.length > 0 && (
        <div className="card">
          <h2>Fixes, biggest gain first</h2>
          {fixes.map((c) => <div key={c.id} className="fix"><b>+{Math.round(c.weight * (1 - c.pass))}</b><span><b>{c.label}.</b> {c.fix}</span></div>)}
          {sc.missingSkills.length > 0 && <p className="msg">Skills on your resume but not on LinkedIn: <b>{sc.missingSkills.join(", ")}</b> <button className="link" onClick={() => navigator.clipboard.writeText(sc.missingSkills.join(", "))}>copy</button></p>}
        </div>
      )}

      <div className="two">
        <div className="card">
          <h2>Headline & About</h2>
          <label>Headline ({li.headline.length}/220)<input value={li.headline} onChange={(e) => set({ headline: e.target.value })} /></label>
          <button className="sec small" disabled={!li.role || busy === "headline"} onClick={() => run("headline", {}, (r) => setHeads(Array.isArray(r.options) ? r.options.map(String) : []))}>{busy === "headline" ? "Writing…" : "✨ Suggest headlines"}</button>
          {!li.role && <span className="msg"> Pick a target role first.</span>}
          {heads.map((h) => <div key={h} className="sug"><div>{h}</div><button onClick={() => { set({ headline: h }); setHeads([]); }}>Use this</button> <button className="sec" onClick={() => navigator.clipboard.writeText(h)}>Copy</button></div>)}
          <label style={{ marginTop: 10 }}>About ({li.about.trim() ? li.about.trim().split(/\s+/).length : 0} words)<textarea rows={7} value={li.about} onChange={(e) => set({ about: e.target.value })} /></label>
          <button className="sec small" disabled={!li.role || busy === "about"} onClick={() => run("about", {}, (r) => setAboutDraft(r.text || ""))}>{busy === "about" ? "Writing…" : "✨ Draft About from my profile"}</button>
          {aboutDraft && <div className="sug"><div style={{ whiteSpace: "pre-wrap" }}>{aboutDraft}</div><button onClick={() => { set({ about: aboutDraft }); setAboutDraft(""); }}>Use this</button> <button className="sec" onClick={() => navigator.clipboard.writeText(aboutDraft)}>Copy</button> <button className="sec" onClick={() => setAboutDraft("")}>Discard</button></div>}
          <p className="msg" style={{ color: "var(--mute)" }}>Drafts only use facts from your master profile. Paste the one you like into LinkedIn.</p>
        </div>
        <div className="card">
          <h2>Profile details</h2>
          <div className="toggles">{TOGGLES.map(([k, l]) => <label key={k} className="chk"><input type="checkbox" checked={li[k]} onChange={(e) => set({ [k]: e.target.checked })} />{l}</label>)}</div>
          <div className="two">{NUMBERS.map(([k, l]) => <label key={k}>{l}<input type="number" min="0" value={li[k]} onChange={(e) => set({ [k]: Math.max(0, Number(e.target.value) || 0) })} /></label>)}</div>
          <label>Location<input value={li.location} onChange={(e) => set({ location: e.target.value })} /></label>
          <label>Skills on LinkedIn (comma separated)<textarea rows={3} value={li.skills} onChange={(e) => set({ skills: e.target.value })} /></label>
          <label>Certifications<textarea rows={2} value={li.certifications} onChange={(e) => set({ certifications: e.target.value })} /></label>
          <h2 style={{ marginTop: 12 }}>Experience ({li.experience.length})</h2>
          {li.experience.length === 0 && <p className="msg">Import your LinkedIn PDF to check each role's description.</p>}
          {li.experience.map((e, i) => (
            <label key={i}>{e.title}{e.company && `, ${e.company}`} <small>({e.description.trim() ? e.description.trim().split(/\s+/).length : 0} words)</small>
              <textarea rows={3} value={e.description} onChange={(ev) => set({ experience: li.experience.map((x, n) => (n === i ? { ...x, description: ev.target.value } : x)) })} />
            </label>
          ))}
        </div>
      </div>
    </>
  );
}
