"use client";
import { useState } from "react";
import { COLUMNS, STATUSES, addInterview, due, followedUp, newApp, setStatus, today, upcoming } from "../lib/store";
import { post } from "./ui";

// a listing is expired if the checker said so or its closing date has passed
export const listing = (a) => (a.listing?.status === "expired" ? a.listing : a.job?.validThrough && Date.parse(a.job.validThrough) < Date.now() ? { status: "expired", reason: "Past its closing date" } : a.listing || null);
const blank = { company: "", title: "", url: "", location: "", status: "applied" };
const fmt = (d) => (d ? new Date(d.length > 10 ? d : `${d}T00:00`).toLocaleString("en-IN", { day: "numeric", month: "short", ...(d.length > 10 && { hour: "numeric", minute: "2-digit" }) }) : "");

function Detail({ a, resumes, profileName, onChange, onDelete, onClose, onPrep }) {
  const [iv, setIv] = useState({ at: "", round: "", notes: "" });
  const [mail, setMail] = useState("");
  const [busy, setBusy] = useState(false);
  const f = (k, label, type = "text") => (
    <label>{label}<input type={type} value={a[k]} onChange={(e) => onChange({ ...a, [k]: e.target.value })} /></label>
  );

  async function draft(kind) {
    setBusy(true); setMail("");
    try {
      const { text } = await post("/api/improve", {
        mode: "email", kind, name: profileName,
        app: { company: a.company, title: a.title, status: a.status, appliedAt: a.appliedAt, contact: a.contact, interviews: a.interviews.map((i) => i.round) },
      });
      setMail(text);
    } catch (e) { setMail(`Error: ${e.message}`); }
    setBusy(false);
  }

  return (
    <div className="card detail">
      <div className="jobhead">
        <h2 style={{ margin: 0 }}>{a.title || "Untitled role"} · {a.company || "Company"}</h2>
        <button className="icon" aria-label="Close details" onClick={onClose}>✕</button>
      </div>
      <div className="dgrid">
        <div>
          <div className="two">{f("company", "Company")}{f("title", "Role")}</div>
          <div className="two">
            <label>Status
              <select value={a.status} onChange={(e) => onChange(setStatus(a, e.target.value))}>
                {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label>Resume used
              <select value={a.resumeId} onChange={(e) => onChange({ ...a, resumeId: e.target.value })}>
                <option value="">—</option>
                {resumes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
          </div>
          <div className="two">{f("appliedAt", "Applied on", "date")}{f("followUpAt", "Follow up on", "date")}</div>
          <div className="two">{f("location", "Location")}{f("salary", "Salary / CTC")}</div>
          {f("contact", "Recruiter / contact")}
          <label>Job link
            <span className="inline"><input value={a.url} onChange={(e) => onChange({ ...a, url: e.target.value })} />
              {/^https?:\/\//.test(a.url) && <a className="filebtn" href={a.url} target="_blank" rel="noopener noreferrer">Open</a>}</span>
          </label>
          <label>Notes<textarea value={a.notes} onChange={(e) => onChange({ ...a, notes: e.target.value })} /></label>
          {listing(a) && <p className={`msg ${listing(a).status === "expired" ? "err" : ""}`}>Listing: <b>{listing(a).status}</b>{listing(a).reason ? ` · ${listing(a).reason}` : ""}{a.listing?.checkedAt ? ` · checked ${fmt(a.listing.checkedAt)}` : ""}</p>}
          {a.job && <p className="msg">{[a.job.workMode, a.job.type, a.job.expMin != null && `${a.job.expMin}${a.job.expMax != null ? `–${a.job.expMax}` : "+"} yrs`, a.job.fit != null && `${a.job.fit}% profile match`, a.job.sources?.length && `via ${a.job.sources.join(", ")}`].filter(Boolean).join(" · ")}</p>}
          {a.desc && <details><summary className="msg">Job description</summary><p className="msg">{a.desc}</p></details>}
        </div>

        <div>
          <h2>Interviews</h2>
          {!a.interviews.length && <p className="msg">No rounds yet.</p>}
          {a.interviews.map((i) => (
            <div className="ver" key={i.id}>
              <span><b>{i.round || "Round"}</b> · {fmt(i.at)}<br /><small>{i.notes}</small></span>
              <button className="icon" aria-label="Delete interview" onClick={() => onChange({ ...a, interviews: a.interviews.filter((x) => x.id !== i.id) })}>✕</button>
            </div>
          ))}
          <div className="two">
            <input type="datetime-local" aria-label="Interview date and time" value={iv.at} onChange={(e) => setIv({ ...iv, at: e.target.value })} />
            <input placeholder="Round (HR, Technical 1…)" value={iv.round} onChange={(e) => setIv({ ...iv, round: e.target.value })} />
          </div>
          <input placeholder="Notes (panel, topics asked…)" value={iv.notes} onChange={(e) => setIv({ ...iv, notes: e.target.value })} />
          <button className="sec small" disabled={!iv.at} onClick={() => { onChange(addInterview(a, iv)); setIv({ at: "", round: "", notes: "" }); }}>+ Add round</button>

          <button className="sec small" style={{ marginTop: 8 }} onClick={() => onPrep(a.id)}>🎯 Prepare for interview</button>

          <h2 style={{ marginTop: 16 }}>AI email drafts</h2>
          <div className="btns">
            <button className="sec small" disabled={busy} onClick={() => draft("followup")}>Follow-up</button>
            <button className="sec small" disabled={busy} onClick={() => draft("thankyou")}>Thank-you after interview</button>
            <button className="sec small" disabled={busy} onClick={() => draft("status")}>Ask for status</button>
          </div>
          {busy && <p className="msg">Writing…</p>}
          {mail && <>
            <textarea style={{ minHeight: 170, marginTop: 8 }} value={mail} onChange={(e) => setMail(e.target.value)} />
            <button className="small" onClick={() => navigator.clipboard?.writeText(mail)}>Copy</button>
          </>}

          <h2 style={{ marginTop: 16 }}>History</h2>
          {[...a.history].reverse().map((h, n) => <div key={n} className="msg">{fmt(h.at)} · {h.text}</div>)}
          <button className="danger small" style={{ marginTop: 12 }} onClick={() => confirm(`Delete ${a.company} application?`) && onDelete()}>Delete application</button>
        </div>
      </div>
    </div>
  );
}

export default function Apps({ apps, setApps, resumes, activeResumeId, profileName, onPrep }) {
  const [form, setForm] = useState(null);
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState("");
  const [checking, setChecking] = useState(false);
  async function checkListings() {
    const items = apps.filter((a) => ["saved", "applied"].includes(a.status) && a.url).map((a) => ({ id: a.id, url: a.url, validThrough: a.job?.validThrough || null }));
    if (!items.length) return;
    setChecking(true);
    try {
      for (let i = 0; i < items.length; i += 25) {
        const { results } = await post("/api/jobs/check", { items: items.slice(i, i + 25) });
        setApps((l) => l.map((a) => (results[a.id] ? { ...a, listing: results[a.id] } : a)));
      }
    } catch {}
    setChecking(false);
  }
  const on = today();
  const dueNow = due(apps, on);
  const next = upcoming(apps, on).slice(0, 5);
  const upd = (id, fn) => setApps((list) => list.map((x) => (x.id === id ? fn(x) : x)));
  const sel = apps.find((a) => a.id === open);
  const shown = apps.filter((a) => !q || `${a.company} ${a.title}`.toLowerCase().includes(q.toLowerCase()));

  const counts = Object.fromEntries(STATUSES.map(([k]) => [k, apps.filter((a) => a.status === k).length]));
  const sent = apps.length - counts.saved;
  const interviewed = apps.filter((a) => a.interviews.length || ["interview", "offer"].includes(a.status)).length; // includes later rejections
  const pct = (n) => (sent ? Math.round((n / sent) * 100) : 0);

  return (
    <>
      <div className="stats">
        <div className="stat"><b>{sent}</b><span>Applied</span></div>
        <div className="stat"><b>{interviewed}</b><span>Got interviews · {pct(interviewed)}%</span></div>
        <div className="stat"><b>{counts.offer}</b><span>Offers · {pct(counts.offer)}%</span></div>
        <div className={`stat ${dueNow.length ? "hot" : ""}`}><b>{dueNow.length}</b><span>Follow-ups due</span></div>
      </div>

      {(dueNow.length > 0 || next.length > 0) && (
        <div className="card today">
          {dueNow.length > 0 && <>
            <h2>Follow up today</h2>
            {dueNow.map((a) => (
              <div className="ver" key={a.id}>
                <span><b>{a.company}</b> · {a.title} <small>(due {fmt(a.followUpAt)})</small></span>
                <span className="btns">
                  <button className="sec small" onClick={() => setOpen(a.id)}>Draft email</button>
                  <button className="small" onClick={() => upd(a.id, (x) => followedUp(x, on))}>Done ✓</button>
                </span>
              </div>
            ))}
          </>}
          {next.length > 0 && <>
            <h2 style={{ marginTop: dueNow.length ? 12 : 0 }}>Upcoming interviews</h2>
            {next.map((i) => <div className="msg" key={i.id}><b>{fmt(i.at)}</b> · {i.app.company} · {i.round || "Interview"}</div>)}
          </>}
        </div>
      )}

      <div className="card">
        <div className="btns" style={{ justifyContent: "space-between" }}>
          <input style={{ maxWidth: 260, margin: 0 }} placeholder="Search company or role" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="btns">
            <button className="sec" disabled={checking} onClick={checkListings} title="Re-check wishlist and applied job links for closed or expired postings">{checking ? "Checking…" : "Check listings"}</button>
            <button onClick={() => setForm(form ? null : { ...blank, appliedAt: on })}>{form ? "Cancel" : "+ Add application"}</button>
          </span>
        </div>
        {form && (
          <div className="addform">
            <div className="two">
              <input placeholder="Company *" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              <input placeholder="Role *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="two">
              <input placeholder="Job link" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.slice(0, 2).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <button disabled={!form.company.trim() || !form.title.trim()}
              onClick={() => { setApps((l) => [newApp({ ...form, resumeId: activeResumeId }), ...l]); setForm(null); }}>Save</button>
          </div>
        )}
      </div>

      {sel && <Detail key={sel.id} a={sel} resumes={resumes} profileName={profileName}
        onChange={(n) => upd(sel.id, () => n)} onDelete={() => { setApps((l) => l.filter((x) => x.id !== sel.id)); setOpen(null); }} onClose={() => setOpen(null)} onPrep={onPrep} />}

      {!apps.length && <p className="msg">No applications yet. Add one, or use “Save to tracker” on the Jobs tab.</p>}
      <div className="board">
        {COLUMNS.map(([k, label, sts]) => {
          const list = shown.filter((a) => sts.includes(a.status));
          return (
            <div className="col" key={k}>
              <div className="colhead">{label} <span>{list.length}</span></div>
              {list.map((a) => (
                <button key={a.id} className={`acard ${a.id === open ? "on" : ""}`} onClick={() => setOpen(a.id === open ? null : a.id)}>
                  <b>{a.company || "—"}</b>
                  <span>{a.title}</span>
                  <small>
                    {a.status === "rejected" ? "Rejected" : a.status === "withdrawn" ? "Withdrawn" : a.appliedAt ? `Applied ${fmt(a.appliedAt)}` : "Not applied"}
                    {a.followUpAt && a.followUpAt <= on ? " · follow up!" : ""}
                    {a.interviews.length ? ` · ${a.interviews.length} round${a.interviews.length > 1 ? "s" : ""}` : ""}
                    {listing(a)?.status === "expired" && <b className="expired"> · Expired</b>}
                  </small>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
