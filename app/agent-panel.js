"use client";
import { useEffect, useRef, useState } from "react";
import { NEEDS_APPROVAL, compareVersions, skillGaps, validateCall } from "../lib/agent";
import { analyze, extractJd } from "../lib/ats";
import { PRESET_BOARDS, appFromJob, compat, dedupeKey, filterJobs, profileContext, salaryLabel, ago } from "../lib/jobs";
import { due, followedUp, today, upcoming } from "../lib/store";
import { recordDiscovered } from "../lib/analytics";
import { Md, color, post } from "./ui";

const EXAMPLES = [
  "Find the jobs where my resume has more than 80% compatibility.",
  "Show my applications that need follow-up.",
  "Identify my top five technical skill gaps.",
  "Compare my last three resume versions.",
  "Prepare me for my upcoming interview.",
  "Prepare a tailored resume for J1.",
];
const ACTION_TEXT = {
  save_to_wishlist: (a, ref) => `Save ${a.job_ref} “${ref?.job?.title}” at ${ref?.job?.company} to your wishlist`,
  mark_followed_up: (a, ref, s) => { const x = s.apps.find((y) => y.id === ref?.id); return `Mark ${a.app_ref} (${x?.company} · ${x?.title}) as followed up today`; },
  open_tailoring: (a) => `Open the Tailor tab for ${a.job_ref}${a.resume ? ` using “${a.resume}”` : ""} (you review every change in Approval Mode)`,
  open_interview_prep: (a, ref, s) => { const x = s.apps.find((y) => y.id === ref?.id); return `Open interview prep for ${a.app_ref} (${x?.company} · ${x?.title})`; },
};

export default function AgentPanel({ s, setS, r, setJd, setTab, setPrepFor }) {
  const [log, setLog] = useState([]);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const sRef = useRef(s); sRef.current = s;
  const refs = useRef({});        // "J1" -> { kind: "job", job }, "A1" -> { kind: "app", id }
  const counters = useRef({ J: 0, A: 0 });
  const lastJobs = useRef([]);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [log, pending]);

  const add = (item) => setLog((l) => [...l, item]);
  const findResume = (name) => (name && sRef.current.resumes.find((x) => x.name.toLowerCase().includes(name.toLowerCase()))) || sRef.current.resumes.find((x) => x.id === sRef.current.active) || r;
  const appRef = (id) => {
    const hit = Object.entries(refs.current).find(([, v]) => v.kind === "app" && v.id === id);
    if (hit) return hit[0];
    const ref = `A${++counters.current.A}`; refs.current[ref] = { kind: "app", id }; return ref;
  };
  const jobOf = (ref) => {
    const x = refs.current[ref];
    if (x?.kind === "job") return x.job;
    const a = sRef.current.apps.find((y) => y.id === x?.id);
    return a ? { title: a.title, company: a.company, desc: a.desc || "", url: a.url } : null;
  };

  // ---- read-only tools: run immediately, results are plain data for the model ----
  const READ = {
    async search_jobs({ keywords, min_match = 0, region = "any", work_mode = "any", limit = 10 }) {
      const st = sRef.current;
      const kw = keywords || st.profile.skills.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 3).join(",") || "developer";
      const p = new URLSearchParams({ q: kw.toLowerCase(), boards: JSON.stringify((st.boards || PRESET_BOARDS).filter((b) => !b.off)) });
      const res = await (await fetch(`/api/jobs?${p}`)).json();
      const ctx = profileContext(st);
      const scored = res.jobs.map((j) => ({ ...j, fit: compat(j, ctx) }));
      lastJobs.current = scored;
      setS((p) => ({ ...p, discovered: recordDiscovered(p.discovered, res.jobs, undefined, dedupeKey) }));
      const list = filterJobs(scored, { region: region === "any" ? "all" : region, modes: work_mode === "any" ? [] : [work_mode], hideExpired: true })
        .filter((j) => j.fit.pct >= min_match).sort((a, b) => b.fit.pct - a.fit.pct).slice(0, limit);
      const saved = new Set(st.apps.flatMap((a) => [a.url, dedupeKey(a)]));
      const out = list.map((j) => {
        const ref = `J${++counters.current.J}`; refs.current[ref] = { kind: "job", job: j };
        return { ref, title: j.title, company: j.company, location: j.location, work_mode: j.workMode, match: j.fit.pct, missing_skills: j.fit.missing.slice(0, 4), salary: salaryLabel(j) || null, posted: ago(j.posted) || null, in_wishlist: saved.has(j.url) || saved.has(dedupeKey(j)), url: j.url };
      });
      add({ type: "jobs", items: out });
      return { keywords_used: kw, searched: res.jobs.length, matching: out.length, jobs: out, sources_with_errors: res.sources.filter((x) => x.error).map((x) => x.name) };
    },
    async list_applications({ status = "any", needs_follow_up, upcoming_interviews }) {
      const st = sRef.current, on = today();
      const dueIds = new Set(due(st.apps, on).map((a) => a.id));
      const next = upcoming(st.apps, on);
      const list = st.apps.filter((a) => (status === "any" || a.status === status) && (!needs_follow_up || dueIds.has(a.id)) && (!upcoming_interviews || next.some((i) => i.app.id === a.id)));
      return {
        count: list.length,
        applications: list.slice(0, 30).map((a) => ({
          ref: appRef(a.id), company: a.company, title: a.title, status: a.status, applied_on: a.appliedAt || null,
          follow_up_due: dueIds.has(a.id) ? a.followUpAt : null, next_interview: next.find((i) => i.app.id === a.id) ? `${next.find((i) => i.app.id === a.id).at} (${next.find((i) => i.app.id === a.id).round || "interview"})` : null,
          resume_used: st.resumes.find((x) => x.id === a.resumeId)?.name || null, listing: a.listing?.status || null, url: a.url || null,
        })),
      };
    },
    async get_profile_summary() {
      const st = sRef.current, c = profileContext(st);
      return { name: st.profile.name, years_experience: Math.round(c.years * 10) / 10, skills: st.profile.skills, recent_roles: st.profile.jobs.map((j) => `${j.role} @ ${j.company}`).slice(0, 5), resumes: st.resumes.map((x) => x.name), active_resume: findResume().name, applications: st.apps.length };
    },
    async skill_gaps({ top = 5 }) {
      const st = sRef.current;
      const seen = new Set();
      const jobs = [...st.apps.filter((a) => !["rejected", "withdrawn"].includes(a.status)), ...lastJobs.current]
        .filter((j) => (j.desc || "").length > 50 && !seen.has(dedupeKey(j)) && seen.add(dedupeKey(j)));
      if (!jobs.length) return { error: "No job descriptions to analyse yet. Search for jobs or save some to your wishlist first." };
      return skillGaps(st.profile, jobs, top);
    },
    async compare_resume_versions({ resume, count = 3 }) { return compareVersions(findResume(resume), count); },
    async ats_check({ job_ref, resume }) {
      const j = jobOf(job_ref), res = findResume(resume);
      if (!j?.desc) return { error: `${job_ref} has no job description saved.` };
      const a = analyze({ d: res.d, hidden: res.hidden, resumeName: res.name, jd: `${j.title}\n${j.desc}`, jdInfo: extractJd(`${j.title}\n${j.desc}`) });
      return { resume: res.name, job: `${j.title} @ ${j.company}`, ats: a.total, label: a.label, categories: a.categories.filter((c) => c.pct != null).map((c) => `${c.name}: ${c.pct}%`), missing_required: a.kw?.missingReq || [], top_issues: a.issues.slice(0, 4).map((i) => i.text) };
    },
    async draft_email({ app_ref, kind }) {
      const a = sRef.current.apps.find((x) => x.id === refs.current[app_ref]?.id);
      if (!a) return { error: "Application not found" };
      const { text } = await post("/api/improve", { mode: "email", kind, name: sRef.current.profile.name, app: { company: a.company, title: a.title, status: a.status, appliedAt: a.appliedAt, contact: a.contact, interviews: a.interviews.map((i) => i.round) } });
      add({ type: "draft", text });
      return { draft: text, note: "Shown to the user to copy. Not sent." };
    },
  };

  // ---- actions: only after the user approves ----
  const WRITE = {
    save_to_wishlist({ job_ref }) {
      const j = refs.current[job_ref]?.job;
      const st = sRef.current;
      if (st.apps.some((a) => a.url === j.url || dedupeKey(a) === dedupeKey(j))) return { done: false, reason: "Already in wishlist" };
      const app = appFromJob(j, findResume().id);
      setS((p) => ({ ...p, apps: [app, ...p.apps] }));
      return { done: true, app_ref: appRef(app.id) };
    },
    mark_followed_up({ app_ref }) {
      const id = refs.current[app_ref].id;
      setS((p) => ({ ...p, apps: p.apps.map((a) => (a.id === id ? followedUp(a) : a)) }));
      return { done: true, next_follow_up: "in 7 days" };
    },
    open_tailoring({ job_ref, resume }) {
      const j = jobOf(job_ref);
      if (!j?.desc) return { done: false, reason: "No job description available for that ref" };
      const res = findResume(resume);
      setS((p) => ({ ...p, active: res.id }));
      setJd(`${j.title}\n${j.desc}`); setTab("tailor");
      return { done: true, opened: "Tailor tab", resume: res.name, note: "User reviews and accepts each change there." };
    },
    open_interview_prep({ app_ref }) {
      setPrepFor(refs.current[app_ref].id); setTab("interview");
      return { done: true, opened: "Interview tab" };
    },
  };

  const approve = (name, args) => new Promise((resolve) => setPending({ name, args, resolve }));

  async function send(text) {
    if (!text.trim() || busy) return;
    setInput(""); setBusy(true);
    add({ type: "user", text });
    let h = [...msgs, { role: "user", content: text }];
    try {
      for (let step = 0; step < 8; step++) {
        const { message } = await post("/api/agent", { messages: h });
        h = [...h, message];
        if (message.content?.trim()) add({ type: "assistant", text: message.content });
        if (!message.tool_calls?.length) break;
        for (const c of message.tool_calls) {
          const name = c.function.name;
          const v = validateCall(name, c.function.arguments, refs.current);
          let result;
          if (!v.ok) result = { error: v.error };
          else if (NEEDS_APPROVAL.has(name)) {
            const ok = await approve(name, v.args);
            result = ok ? WRITE[name](v.args) : { done: false, declined_by_user: true };
          } else {
            try { result = await READ[name](v.args); } catch (e) { result = { error: e.message || "Tool failed" }; }
          }
          add({ type: "tool", name, args: v.ok ? v.args : c.function.arguments, ok: v.ok && !result.error && !result.declined_by_user, note: result.error || (result.declined_by_user ? "declined" : result.done === true ? "done" : summary(name, result)) });
          h = [...h, { role: "tool", tool_call_id: c.id, content: JSON.stringify(result).slice(0, 8500) }];
        }
      }
    } catch (e) { add({ type: "error", text: e.message }); }
    setMsgs(h.slice(-40));
    setBusy(false);
  }

  const summary = (name, res) => (name === "search_jobs" ? `${res.matching} of ${res.searched} jobs` : name === "list_applications" ? `${res.count} applications` : name === "skill_gaps" ? `${res.gaps?.length} gaps from ${res.analysed_jobs} jobs` : name === "ats_check" ? `ATS ${res.ats}` : "ok");

  return (
    <div className="agent">
      <div className="card">
        <h2>AI Career Agent</h2>
        <p className="msg">Ask in plain English. The agent can only <b>request</b> a fixed set of tools (search jobs, read applications, skill gaps, compare versions, ATS check, draft emails). JobKit validates every request and runs it, and anything that changes your data or opens a page waits for your approval.</p>
        <div>{EXAMPLES.map((e) => <button key={e} className="chip small" disabled={busy} onClick={() => send(e)}>{e}</button>)}</div>
      </div>

      <div className="card chat">
        {!log.length && <p className="msg">Try one of the examples above.</p>}
        {log.map((x, i) => {
          if (x.type === "user") return <div key={i} className="bubble me">{x.text}</div>;
          if (x.type === "assistant") return <div key={i} className="bubble bot"><Md t={x.text} /></div>;
          if (x.type === "error") return <div key={i} className="msg err">⚠ {x.text}</div>;
          if (x.type === "draft") return <div key={i} className="bubble bot"><b>Email draft</b><textarea readOnly style={{ minHeight: 150, marginTop: 6 }} value={x.text} /></div>;
          if (x.type === "tool") return <div key={i} className={`toolline ${x.ok ? "" : "bad"}`}>🔧 {x.name}({typeof x.args === "string" ? x.args : Object.entries(x.args).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")}) → {x.note}</div>;
          if (x.type === "jobs") return (
            <div key={i} className="jobcards">
              {x.items.map((j) => (
                <div key={j.ref} className="jobcard">
                  <span className="tag" style={{ background: color(j.match), color: "#fff" }}>{j.match}%</span>
                  <b>{j.ref}</b> <a href={j.url} target="_blank" rel="noopener noreferrer">{j.title}</a>
                  <div className="msg">{j.company} · {j.location}{j.salary ? ` · ${j.salary}` : ""}{j.in_wishlist ? " · in wishlist" : ""}</div>
                </div>
              ))}
            </div>
          );
          return null;
        })}
        {pending && (
          <div className="approve">
            <b>Approve this action?</b>
            <div>{ACTION_TEXT[pending.name](pending.args, refs.current[pending.args.job_ref || pending.args.app_ref], s)}</div>
            <div className="btns" style={{ marginTop: 8 }}>
              <button onClick={() => { pending.resolve(true); setPending(null); }}>Approve</button>
              <button className="sec" onClick={() => { pending.resolve(false); setPending(null); }}>Decline</button>
            </div>
          </div>
        )}
        {busy && !pending && <div className="msg">Working…</div>}
        <div ref={endRef} />
      </div>

      <div className="card inline">
        <input aria-label="Message the career agent" placeholder="e.g. Find remote React jobs above 70% match" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)} disabled={busy} />
        <button disabled={busy || !input.trim()} onClick={() => send(input)}>Send</button>
        <button className="sec" disabled={busy} onClick={() => { setLog([]); setMsgs([]); refs.current = {}; counters.current = { J: 0, A: 0 }; lastJobs.current = []; }}>New chat</button>
      </div>
    </div>
  );
}
