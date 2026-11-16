"use client";
import { useMemo } from "react";
import { analytics } from "../lib/analytics";
import { color } from "./ui";

const short = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

// one single-hue column chart per measure (small multiples, no shared/dual axis); native tooltip on each column
function Weekly({ weeks, k, label }) {
  const max = Math.max(1, ...weeks.map((w) => w[k]));
  const W = 260, H = 70, bw = W / weeks.length;
  const total = weeks.reduce((s, w) => s + w[k], 0);
  return (
    <div className="mini">
      <div><b>{label}</b> <span>{total} in {weeks.length} weeks</span></div>
      <svg viewBox={`0 0 ${W} ${H + 14}`} role="img" aria-label={`${label} per week`}>
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--line)" />
        {weeks.map((w, i) => {
          const h = (w[k] / max) * (H - 4);
          return (
            <g key={w.week}>
              <rect x={i * bw} y="0" width={bw} height={H} fill="transparent"><title>{`Week of ${short(w.week)}: ${w[k]}`}</title></rect>
              {w[k] > 0 && <rect x={i * bw + 2} y={H - h} width={bw - 4} height={h} rx="3" fill="var(--brand)" pointerEvents="none" />}
            </g>
          );
        })}
        <text x="0" y={H + 12} fontSize="9" fill="var(--mute)">{short(weeks[0].week)}</text>
        <text x={W} y={H + 12} fontSize="9" fill="var(--mute)" textAnchor="end">this week</text>
      </svg>
    </div>
  );
}

function HBar({ label, n, max, note }) {
  return (
    <div className="hbar" title={`${label}: ${n}${note ? ` (${note})` : ""}`}>
      <span>{label}</span>
      <div><i style={{ width: `${max ? (n / max) * 100 : 0}%` }} /></div>
      <b>{n}{note && <small> {note}</small>}</b>
    </div>
  );
}

export default function AnalyticsPanel({ s }) {
  const x = useMemo(() => analytics(s), [s]);
  const k = x.kpis;
  const funnel = [["Discovered", k.discovered], ["Saved", k.saved], ["Applied", k.submitted], ["Interviews", k.interviews], ["Offers", k.offers]];
  const fmax = Math.max(...funnel.map((f) => f[1]));

  if (!k.saved && !k.discovered) return <div className="card"><h2>Career analytics</h2><p className="msg">Nothing to measure yet. Search jobs in the Jobs tab and track applications, and your funnel will appear here.</p></div>;

  return (
    <>
      <div className="stats">
        <div className="stat"><b>{k.submitted}</b><span>Applications submitted</span></div>
        <div className="stat"><b>{k.interviewConv}%</b><span>Application → interview ({k.interviews})</span></div>
        <div className="stat"><b>{k.offers}</b><span>Offers ({k.offerConv}% of interviews)</span></div>
        <div className="stat"><b>{k.rejectionPct}%</b><span>Rejection rate</span></div>
      </div>

      {x.insights.length > 0 && <div className="card"><h2>What the numbers say</h2><ul className="ins">{x.insights.map((t) => <li key={t}>{t}</li>)}</ul></div>}

      <div className="two">
        <div className="card">
          <h2>Funnel</h2>
          {funnel.map(([l, n]) => <HBar key={l} label={l} n={n} max={fmax} />)}
          <p className="msg" style={{ color: "var(--mute)" }}>Discovered counts each job once, from Jobs and Agent searches on this device.</p>
        </div>
        <div className="card">
          <h2>Is resume quality paying off?</h2>
          {x.ats.n === 0 ? <p className="msg">Link a resume and paste the job description on your applications to see the ATS score of what you actually sent.</p> : (
            <>
              <div className="stats three">
                <div className="stat"><b style={{ color: color(x.ats.avg) }}>{x.ats.avg}</b><span>Average ATS sent ({x.ats.n})</span></div>
                <div className="stat"><b>{x.ats.interviewedAvg ?? "–"}</b><span>ATS where you got interviews</span></div>
                <div className="stat"><b>{x.ats.othersAvg ?? "–"}</b><span>ATS where you didn't</span></div>
              </div>
              <p className="msg" style={{ color: "var(--mute)" }}>Rule-based score of the linked resume against each application's job description.</p>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Weekly activity</h2>
        <div className="minis">
          <Weekly weeks={x.weeks} k="discovered" label="Jobs discovered" />
          <Weekly weeks={x.weeks} k="saved" label="Jobs saved" />
          <Weekly weeks={x.weeks} k="applied" label="Applications" />
          <Weekly weeks={x.weeks} k="interviews" label="Interviews" />
        </div>
      </div>

      <div className="two">
        <div className="card">
          <h2>Most frequently missing skills</h2>
          {x.gaps.length === 0 ? <p className="msg">Add job descriptions to your applications to find gaps.</p>
            : x.gaps.map((g) => <HBar key={g.skill} label={g.skill} n={g.jobs} max={x.gaps[0].jobs} note={g.share} />)}
          {x.gaps.length > 0 && <p className="msg" style={{ color: "var(--mute)" }}>Learn these before adding them to a resume.</p>}
        </div>
        <div className="card">
          <h2>Resume performance</h2>
          {x.byResume.length === 0 ? <p className="msg">No submitted applications yet.</p> : (
            <table className="tbl"><thead><tr><th>Resume</th><th>Sent</th><th>Interviews</th><th>Conv.</th><th>Avg ATS</th></tr></thead>
              <tbody>{x.byResume.map((r) => <tr key={r.name}><td>{r.name}</td><td>{r.submitted}</td><td>{r.interviews}</td><td>{r.conv}%</td><td>{r.avgAts ?? "–"}</td></tr>)}</tbody></table>
          )}
        </div>
      </div>

      {x.companies.length > 0 && (
        <div className="card">
          <h2>Companies applied to ({x.companies.length})</h2>
          <table className="tbl"><thead><tr><th>Company</th><th>Applications</th><th>Interviews</th><th>Latest status</th></tr></thead>
            <tbody>{x.companies.map((c) => <tr key={c.company}><td>{c.company}</td><td>{c.applications}</td><td>{c.interviews}</td><td>{c.status}</td></tr>)}</tbody></table>
        </div>
      )}
    </>
  );
}
