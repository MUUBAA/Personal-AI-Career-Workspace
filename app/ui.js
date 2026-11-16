"use client";
import { useState } from "react";
import { bullets, emptyJob } from "../lib/store";

export const color = (n) => (n >= 75 ? "var(--good)" : n >= 50 ? "var(--warn)" : "var(--bad)");
export const post = async (url, body) => {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: "Bad response" }));
  if (!r.ok || j.error) throw new Error(j.error || "Request failed");
  return j;
};

export function Ring({ n }) {
  const c = 2 * Math.PI * 46;
  return (
    <svg className="ring" viewBox="0 0 110 110">
      <circle cx="55" cy="55" r="46" fill="none" stroke="var(--line)" strokeWidth="10" />
      <circle cx="55" cy="55" r="46" fill="none" stroke={color(n)} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${(c * n) / 100} ${c}`} transform="rotate(-90 55 55)" />
      <text x="55" y="63" textAnchor="middle">{n}</text>
    </svg>
  );
}

export function Bar({ label, n }) {
  return <div>{label} · {n}%<div className="bar"><i style={{ width: `${n}%`, background: color(n) }} /></div></div>;
}

// inline markdown: [text](https://link) and **bold**; only http(s) links are rendered
function Inline({ t }) {
  return t.split(/(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*\*[^*]+\*\*)/g).map((p, i) => {
    const m = p.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (m) return <a key={i} href={m[2]} target="_blank" rel="noopener noreferrer">{m[1]}</a>;
    if (/^\*\*[^*]+\*\*$/.test(p)) return <b key={i}>{p.slice(2, -2)}</b>;
    return p;
  });
}

// minimal markdown: headings, bullets / numbered items, inline links and bold
export function Md({ t }) {
  return (
    <div className="ai">
      {t.split("\n").map((l, i) => {
        if (/^#+\s/.test(l)) return <h4 key={i}><Inline t={l.replace(/^#+\s/, "").replace(/\*\*/g, "")} /></h4>;
        if (/^\s*([-*]|\d+\.)\s/.test(l)) return <li key={i} style={{ marginLeft: /^\s{2,}/.test(l) ? 18 : 0 }}><Inline t={l.replace(/^\s*([-*]|\d+\.)\s/, "")} /></li>;
        return l.trim() ? <p key={i}><Inline t={l} /></p> : null;
      })}
    </div>
  );
}

// one input per bullet, each with an AI rewrite that must be accepted before it replaces the original
function BulletList({ value, onChange, role, placeholder }) {
  const lines = value ? value.split("\n") : [""];
  const [sug, setSug] = useState({}); // index -> suggestion | "..." | Error
  const set = (i, v) => onChange(lines.map((l, n) => (n === i ? v : l)).join("\n"));
  const del = (i) => onChange(lines.filter((_, n) => n !== i).join("\n"));

  async function improve(i) {
    setSug((s) => ({ ...s, [i]: "..." }));
    try {
      const { text } = await post("/api/improve", { mode: "bullet", bullet: lines[i], role });
      setSug((s) => ({ ...s, [i]: text }));
    } catch (e) { setSug((s) => ({ ...s, [i]: new Error(e.message) })); }
  }
  const drop = (i) => setSug(({ [i]: _, ...rest }) => rest);

  return (
    <div className="blist">
      {lines.map((l, i) => (
        <div key={i}>
          <div className="brow">
            <span>•</span>
            <input value={l} placeholder={placeholder} onChange={(e) => set(i, e.target.value)} />
            <button className="icon" title="Improve with AI" aria-label="Improve bullet with AI" disabled={!l.trim() || sug[i] === "..."} onClick={() => improve(i)}>✨</button>
            <button className="icon" title="Remove" aria-label="Remove bullet" onClick={() => del(i)}>✕</button>
          </div>
          {sug[i] === "..." && <div className="sug">Improving…</div>}
          {sug[i] instanceof Error && <div className="sug err">{sug[i].message} <button className="link" onClick={() => drop(i)}>dismiss</button></div>}
          {typeof sug[i] === "string" && sug[i] !== "..." && (
            <div className="sug">
              <div>{sug[i]}</div>
              <button onClick={() => { set(i, sug[i]); drop(i); }}>Use this</button> <button className="sec" onClick={() => drop(i)}>Keep mine</button>
            </div>
          )}
        </div>
      ))}
      <button className="sec small" onClick={() => onChange(value ? `${value}\n` : "\n")}>+ bullet</button>
    </div>
  );
}

export function Editor({ d, onChange, role }) {
  const field = (k, label, area) => (
    <label key={k}>{label}
      {area
        ? <textarea value={d[k]} onChange={(e) => onChange({ ...d, [k]: e.target.value })} />
        : <input value={d[k]} onChange={(e) => onChange({ ...d, [k]: e.target.value })} />}
    </label>
  );
  const setJob = (i, k, v) => onChange({ ...d, jobs: d.jobs.map((j, n) => (n === i ? { ...j, [k]: v } : j)) });
  const moveJob = (i, dir) => {
    const jobs = [...d.jobs], k = i + dir;
    if (k < 0 || k >= jobs.length) return;
    [jobs[i], jobs[k]] = [jobs[k], jobs[i]];
    onChange({ ...d, jobs });
  };

  return (
    <>
      <div className="card">
        <h2>Contact & summary</h2>
        {field("name", "Full name")}
        <div className="two">{field("email", "Email")}{field("phone", "Phone")}</div>
        {field("location", "Location")}{field("links", "LinkedIn / GitHub / Portfolio")}
        {field("summary", "Summary", true)}{field("skills", "Skills (comma separated)", true)}
      </div>
      <div className="card">
        <h2>Experience</h2>
        {d.jobs.map((j, i) => (
          <div className="jobedit" key={i}>
            <div className="jobhead">
              <b>{j.role || `Job ${i + 1}`}</b>
              <span>
                <button className="icon" aria-label="Move job up" onClick={() => moveJob(i, -1)}>↑</button>
                <button className="icon" aria-label="Move job down" onClick={() => moveJob(i, 1)}>↓</button>
                <button className="icon" aria-label="Remove job" onClick={() => onChange({ ...d, jobs: d.jobs.length > 1 ? d.jobs.filter((_, n) => n !== i) : [emptyJob] })}>✕</button>
              </span>
            </div>
            <div className="two">
              <input placeholder="Role" value={j.role} onChange={(e) => setJob(i, "role", e.target.value)} />
              <input placeholder="Company" value={j.company} onChange={(e) => setJob(i, "company", e.target.value)} />
            </div>
            <input placeholder="Dates (Jan 2022 - Present)" value={j.dates} onChange={(e) => setJob(i, "dates", e.target.value)} />
            <BulletList value={j.bullets} role={role} placeholder="What you did and its impact" onChange={(v) => setJob(i, "bullets", v)} />
          </div>
        ))}
        <button className="sec" onClick={() => onChange({ ...d, jobs: [...d.jobs, emptyJob] })}>+ Add job</button>
      </div>
      <div className="card">
        <h2>Projects</h2>
        <BulletList value={d.projects} role={role} placeholder="Project: what it does, stack, result" onChange={(v) => onChange({ ...d, projects: v })} />
        <h2 style={{ marginTop: 14 }}>Education</h2>
        <textarea placeholder="One per line" value={d.education} onChange={(e) => onChange({ ...d, education: e.target.value })} />
      </div>
    </>
  );
}

// A4 with 12 mm margins (matches @page in globals.css)
const PAGE_W = "186mm", PAGE_H_MM = 272, MIN_ZOOM = 0.8;
// largest zoom (1 down to 0.8) at which the sheet prints on one page; measured on an off-screen print-sized clone
export function fitOnePage(el) {
  if (!el) return { zoom: 1, fits: true };
  const box = Object.assign(document.createElement("div"), { style: `position:fixed;left:-10000px;top:0;width:${PAGE_W};visibility:hidden` });
  const c = el.cloneNode(true);
  Object.assign(c.style, { padding: "0", minHeight: "0", border: "0", boxShadow: "none" });
  box.appendChild(c); document.body.appendChild(box);
  const maxPx = (PAGE_H_MM * 96) / 25.4;
  let zoom = 1;
  for (; zoom > MIN_ZOOM; zoom = Math.round((zoom - 0.02) * 100) / 100) { c.style.zoom = zoom; if (box.offsetHeight <= maxPx) break; }
  c.style.zoom = zoom;
  const fits = box.offsetHeight <= maxPx;
  box.remove();
  return { zoom, fits };
}

export function Sheet({ d, template = "classic", hidden = [], fit = 1, sheetRef }) {
  const on = (s) => !hidden.includes(s);
  return (
    <div ref={sheetRef} className={`sheet ${template}`} style={{ "--fit": fit }}>
      <h1>{d.name || "Your Name"}</h1>
      <div className="contact">{[d.email, d.phone, d.location, d.links].filter(Boolean).join(" | ")}</div>
      {on("summary") && d.summary && <><h3>Summary</h3><div>{d.summary}</div></>}
      {on("skills") && d.skills && <><h3>Skills</h3><div>{d.skills}</div></>}
      {on("experience") && <>
        <h3>Experience</h3>
        {d.jobs.filter((j) => j.role || j.company).map((j, i) => (
          <div key={i}>
            <div className="row"><span>{j.role}{j.company && `, ${j.company}`}</span><span>{j.dates}</span></div>
            <ul>{bullets(j.bullets).map((b, n) => <li key={n}>{b}</li>)}</ul>
          </div>
        ))}
      </>}
      {on("projects") && d.projects?.trim() && <><h3>Projects</h3><ul>{bullets(d.projects).map((b, n) => <li key={n}>{b}</li>)}</ul></>}
      {on("education") && d.education?.trim() && <><h3>Education</h3>{bullets(d.education).map((b, n) => <div key={n}>{b}</div>)}</>}
    </div>
  );
}
