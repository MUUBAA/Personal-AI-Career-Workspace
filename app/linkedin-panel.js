"use client";
import { useEffect, useMemo, useState } from "react";
import { TEMPLATES, TEMPLATE_CATS, fillTemplate } from "../lib/linkedin-templates";
import { checkUrl, dailyTasks, emptyLi, liScore, streak } from "../lib/linkedin";
import { today, toText } from "../lib/store";
import { Ring, color, post } from "./ui";

const NUMBERS = [["connections", "Connections"], ["followers", "Followers"], ["postsLast30", "Posts (last 30 days)"], ["commentsLast30", "Comments (last 30 days)"], ["featured", "Featured items"], ["recommendations", "Recommendations received"]];
const TOGGLES = [["photo", "Profile photo"], ["banner", "Custom banner"], ["openToWork", "Open to work on"], ["contactInfo", "Email in contact info"]];

// guided tour: [element id, title, text]
const TOUR = [
  ["li-import", "Import your profile", "Start here: add your link and target role, then upload the PDF from LinkedIn's Save to PDF."],
  ["li-score", "Your overall score", "A rule-based score out of 100. The same profile always gets the same score."],
  ["li-steps", "Steps to improve", "The weakest sections first, each with its biggest fix. Press Fix to jump to where you change it."],
  ["li-breakdown", "Breakdown", "Five sections out of 10. Click one to see every check inside it."],
  ["li-tools", "Key tools", "Skills missing from your LinkedIn, and your networking numbers."],
  ["li-templates", "Networking templates", "Copy-and-paste messages. Pick a category; the name and company fill in automatically."],
  ["li-tasks", "Today's tasks", "Three small actions a day. Finish all three to build a streak."],
];
const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export default function LinkedInPanel({ s, setS, presets, fileToText }) {
  const li = { ...emptyLi, ...(s.linkedin || {}) };
  const set = (patch) => setS((p) => ({ ...p, linkedin: { ...emptyLi, ...(p.linkedin || {}), ...patch } }));
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [heads, setHeads] = useState([]);
  const [aboutDraft, setAboutDraft] = useState("");
  const [postDraft, setPostDraft] = useState("");
  const [openSec, setOpenSec] = useState("");
  const [tcat, setTcat] = useState("connect");
  const [tv, setTv] = useState({ name: "", company: "" });
  const [copied, setCopied] = useState("");
  const [tour, setTour] = useState(-1);

  useEffect(() => {
    if (tour < 0) return;
    const el = document.getElementById(TOUR[tour][0]);
    el?.classList.add("tourhl");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    return () => el?.classList.remove("tourhl");
  }, [tour]);

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

  const copy = (id, text) => { navigator.clipboard?.writeText(text); setCopied(id); setTimeout(() => setCopied(""), 1500); };
  const shareText = `My LinkedIn profile score is ${sc.total}/100 (${sc.label}), checked with JobKit. ${sc.sections.map((x) => `${x.name} ${x.score}/10`).join(" · ")}`;
  const share = async () => {
    try { if (navigator.share) { await navigator.share({ text: shareText }); return; } } catch { return; } // user cancelled the share sheet
    copy("share", shareText);
  };
  const tvars = { name: tv.name, company: tv.company || companies[0] || "", role: li.role, skill: mySkills[0] || "", me: (s.profile.name || "").trim().split(/\s+/)[0] };
  const steps = sc.sections.filter((x) => x.fixes.length).sort((a, b) => a.pct - b.pct); // weakest section first

  return (
    <div className="liwrap">
      <aside className="liside">
        <div className="liside-score"><Ring n={sc.total} /><small>Overall</small></div>
        <nav aria-label="LinkedIn review sections">
          <button className="navi" onClick={() => go("li-score")}>Score</button>
          {sc.sections.map((x) => <button key={x.name} className="navi" onClick={() => { setOpenSec(x.name); go("li-breakdown"); }}><span>{x.name}</span><b style={{ color: color(x.pct) }}>{x.score}/10</b></button>)}
          <hr />
          <button className="navi" onClick={() => go("li-tools")}>Keywords</button>
          <button className="navi" onClick={() => go("li-templates")}>Networking</button>
          <button className="navi" onClick={() => go("li-tasks")}>Daily tasks</button>
          <hr />
          <button className="navi" onClick={share}>{copied === "share" ? "Copied!" : "Share your score"}</button>
          <button className="navi" onClick={() => setTour(0)}>Start tour</button>
        </nav>
      </aside>
      <div className="limain">
      <div className="card" id="li-import">
        <h2 className="rowh">LinkedIn profile booster <button className="sec small" onClick={() => setTour(0)}>Start tour</button></h2>
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

      <div className="card lihero">
        <div className="lihero-score" id="li-score">
          <h2>Overall score</h2>
          <Ring n={sc.total} />
          <b style={{ color: color(sc.total) }}>{sc.label}</b>
          <button className="sec small" style={{ marginTop: 10 }} onClick={share}>{copied === "share" ? "Copied!" : "Share your score"}</button>
          <p className="msg">Your score is out of 100. Aim for 90+.<br />Rule-based: {sc.checks.length} checks, same profile, same score.</p>
        </div>
        <div className="lihero-steps" id="li-steps">
          <h2>Steps to improve your score</h2>
          <p className="msg" style={{ marginTop: 0 }}>{sc.total >= 90 ? "Excellent. Your profile is in great shape." : sc.total >= 70 ? "Strong profile. A few fixes will get you to 90+." : sc.total >= 50 ? "Decent start, but there's still room for improvement. Start with these:" : "Your profile needs work. Start with these:"}</p>
          {steps.length === 0 && <p className="msg">Nothing left to fix.</p>}
          {steps.map((x) => (
            <div key={x.name} className="step">
              <div><small>{x.name} · {x.score}/10</small><p>{x.fixes[0].fix}</p></div>
              <button onClick={() => go(x.name === "Headline" || x.name === "Summary" ? "li-headline" : "li-details")}>Fix ›</button>
            </div>
          ))}
        </div>
      </div>

      <div className="two">
        <div className="card" id="li-breakdown">
          <h2>Breakdown</h2>
          <p className="msg" style={{ marginTop: 0 }}>Your score is based on these five sections. Click one to see its checks.</p>
          {sc.sections.map((x) => (
            <div key={x.name}>
              <button className="secrow" onClick={() => setOpenSec(openSec === x.name ? "" : x.name)} aria-expanded={openSec === x.name}>
                <span>{x.name}</span><b style={{ color: color(x.pct) }}>{x.score}/10</b>
                <div className="bar"><i style={{ width: `${x.pct}%`, background: color(x.pct) }} /></div>
              </button>
              {openSec === x.name && <ul className="seclist">{x.checks.map((c) => <li key={c.id} className={c.pass >= 1 ? "ok" : ""}>{c.pass >= 1 ? "✓" : c.pass > 0 ? "◐" : "✗"} {c.label}{c.pass < 1 && <small> — {c.fix}</small>}</li>)}</ul>}
            </div>
          ))}
        </div>
        <div className="card" id="li-tools">
          <h2>Key tools</h2>
          <div className="tool">
            <b>Keywords</b>
            <p className="msg">Recruiters search LinkedIn by skill. {sc.missingSkills.length ? "Skills on your resume that are missing from your LinkedIn:" : "All the skills on your resume are on your LinkedIn."}</p>
            {sc.missingSkills.map((k) => <span key={k} className="chip">{k}</span>)}
            {sc.missingSkills.length > 0 && <button className="link" onClick={() => navigator.clipboard.writeText(sc.missingSkills.join(", "))}>copy all</button>}
          </div>
          <div className="tool">
            <b>Networking</b>
            <p className="msg">{li.connections} connections · {li.followers} followers · {li.postsLast30} posts and {li.commentsLast30} comments in 30 days. Grow to 500+ connections with a short note on each request, and keep up the weekly posting below.</p>
          </div>
        </div>
      </div>

      <div className="card" id="li-templates">
        <h2>LinkedIn networking templates <span className="msg" style={{ fontWeight: 400 }}>{TEMPLATES.length} messages</span></h2>
        <p className="msg" style={{ marginTop: 0 }}>Copy, then edit before you send. The name and company fill in automatically; your role and top skill come from this page.</p>
        <div className="two">
          <label>Their first name<input value={tv.name} placeholder="e.g. Priya" onChange={(e) => setTv({ ...tv, name: e.target.value })} /></label>
          <label>Company<input value={tv.company} placeholder={companies[0] || "e.g. Razorpay"} onChange={(e) => setTv({ ...tv, company: e.target.value })} /></label>
        </div>
        <div>{TEMPLATE_CATS.map(([k, l]) => <button key={k} className={`chip ${tcat === k ? "on" : ""}`} onClick={() => setTcat(k)}>{l}</button>)}</div>
        {TEMPLATES.filter((t) => t.cat === tcat).map((t) => {
          const text = fillTemplate(t.text, tvars), over = t.cat === "connect" && text.length > 200;
          return (
            <div key={t.title} className="sug">
              <small>{t.title}{t.cat === "connect" && <span style={{ color: over ? "var(--bad)" : "inherit" }}> · {text.length}/200 characters</span>}</small>
              <div style={{ whiteSpace: "pre-wrap" }}>{text}</div>
              <button className="sec" onClick={() => copy(t.title, text)}>{copied === t.title ? "Copied!" : "Copy"}</button>
            </div>
          );
        })}
      </div>

      <div className="two">
        <div className="card" id="li-tasks">
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

      <div className="two">
        <div className="card" id="li-headline">
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
        <div className="card" id="li-details">
          <h2>Profile details</h2>
          <div className="toggles">{TOGGLES.map(([k, l]) => <label key={k} className="chk"><input type="checkbox" checked={li[k]} onChange={(e) => set({ [k]: e.target.checked })} />{l}</label>)}</div>
          <div className="two">{NUMBERS.map(([k, l]) => <label key={k}>{l}<input type="number" min="0" value={li[k]} onChange={(e) => set({ [k]: Math.max(0, Number(e.target.value) || 0) })} /></label>)}</div>
          <label>Location<input value={li.location} onChange={(e) => set({ location: e.target.value })} /></label>
          <label>Skills on LinkedIn (comma separated)<textarea rows={3} value={li.skills} onChange={(e) => set({ skills: e.target.value })} /></label>
          <label>Education<textarea rows={2} value={li.education} onChange={(e) => set({ education: e.target.value })} /></label>
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
      </div>
      {tour >= 0 && (
        <div className="tourbox" role="dialog" aria-live="polite" aria-label="Guided tour">
          <small>Step {tour + 1} of {TOUR.length}</small>
          <b>{TOUR[tour][1]}</b>
          <p>{TOUR[tour][2]}</p>
          <div>
            <button className="sec small" onClick={() => setTour(-1)}>Skip</button>{" "}
            <button className="sec small" disabled={tour === 0} onClick={() => setTour(tour - 1)}>Back</button>{" "}
            <button className="small" onClick={() => setTour(tour + 1 < TOUR.length ? tour + 1 : -1)}>{tour + 1 < TOUR.length ? "Next" : "Done"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
