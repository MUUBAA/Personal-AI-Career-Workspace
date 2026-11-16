import test from "node:test";
import assert from "node:assert/strict";
import { analytics, recordDiscovered, weekOf } from "./analytics.js";
import { addInterview, clean, newApp, newResume, setStatus } from "./store.js";

const profile = clean({ name: "A", skills: "React, Node.js", jobs: [{ role: "Developer", company: "X", dates: "Jan 2021 - Present", bullets: "Built React apps with Node.js" }] });
const r = newResume("Main", profile);
const desc = "Full Stack Developer. React, Node.js, AWS, Docker required.";
const on = "2026-11-10";
const apps = [
  newApp({ company: "A1", title: "Dev", desc }, on),
  newApp({ company: "A2", title: "Dev", desc, resumeId: r.id, status: "applied" }, on),
  addInterview(newApp({ company: "A3", title: "Dev", desc, resumeId: r.id, status: "applied" }, on), { at: "2026-11-12T10:00" }),
  setStatus(setStatus(newApp({ company: "A4", title: "Dev", desc, resumeId: r.id, status: "applied" }, on), "interview"), "offer"),
  setStatus(newApp({ company: "A5", title: "Dev", desc, resumeId: r.id, status: "applied" }, on), "rejected"),
];

test("funnel KPIs", () => {
  const s = { profile, resumes: [r], apps, discovered: { a: on, b: on, c: "2026-11-01" } };
  const x = analytics(s, { now: new Date("2026-11-16T12:00:00") });
  assert.deepEqual(x.kpis, { discovered: 3, saved: 5, submitted: 4, interviews: 2, offers: 1, rejectionPct: 25, interviewConv: 50, offerConv: 50 });
  assert.equal(x.ats.n, 4);
  assert.ok(x.ats.avg > 0);
  assert.equal(x.byResume[0].submitted, 4);
  assert.equal(x.weeks.length, 12);
  assert.equal(x.weeks.at(-1).week, "2026-11-16");
  assert.equal(x.weeks.at(-2).applied, 4);
  assert.equal(x.weeks.at(-2).interviews, 1);
  assert.ok(x.gaps.some((g) => g.skill === "aws"));
});

test("weeks start on Monday", () => {
  assert.equal(weekOf("2026-11-16"), "2026-11-16"); // Monday
  assert.equal(weekOf("2026-11-22"), "2026-11-16"); // Sunday
  assert.equal(weekOf("2026-11-15T23:00"), "2026-11-09");
});

test("discovered jobs count once, first date kept", () => {
  const a = recordDiscovered({}, [{ id: "x" }, { id: "y" }], "2026-11-01");
  const b = recordDiscovered(a, [{ id: "x" }, { id: "z" }], "2026-11-05");
  assert.deepEqual(b, { x: "2026-11-01", y: "2026-11-01", z: "2026-11-05" });
});

test("empty state is safe", () => {
  const x = analytics({ apps: [], resumes: [] });
  assert.equal(x.kpis.submitted, 0);
  assert.equal(x.kpis.interviewConv, 0);
  assert.equal(x.ats.avg, null);
  assert.deepEqual(x.insights, []);
});
