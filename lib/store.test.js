import test from "node:test";
import assert from "node:assert";
import { initial, newResume, addVersion, toText } from "./store.js";

test("migrates v1 single resume into profile + first resume", () => {
  const s = initial(null, JSON.stringify({ name: "Ravi", jobs: [{ role: "Dev" }] }));
  assert.equal(s.profile.name, "Ravi");
  assert.equal(s.resumes[0].d.jobs[0].role, "Dev");
  assert.equal(s.active, s.resumes[0].id);
});

test("resume is a copy, not linked to profile", () => {
  const p = { name: "A", jobs: [{ role: "x" }] };
  const r = newResume(".NET", p);
  r.d.jobs[0].role = "changed";
  assert.equal(p.jobs[0].role, "x");
});

test("versions snapshot and cap at 30", () => {
  let r = newResume("x", {});
  for (let i = 0; i < 35; i++) r = addVersion(r, `v${i}`);
  assert.equal(r.versions.length, 30);
  assert.equal(r.versions[0].label, "v34");
});

test("hidden sections leave the text", () => {
  const t = toText({ ...newResume("x", { summary: "SUM", skills: "SK" }).d }, ["summary"]);
  assert.ok(!t.includes("SUM") && t.includes("SK"));
});

import { newApp, setStatus, due, addInterview, followedUp, upcoming, addDays } from "./store.js";

test("old v2 state gets an empty apps list", () => {
  const s = initial(JSON.stringify({ profile: {}, resumes: [{ id: "a" }], active: "a" }), null);
  assert.deepEqual(s.apps, []);
});

test("applying sets applied date and a 7-day follow-up", () => {
  const a = newApp({ company: "X", status: "applied" }, "2026-11-16");
  assert.equal(a.appliedAt, "2026-11-16");
  assert.equal(a.followUpAt, "2026-11-23");
  assert.equal(a.history.length, 2);
});

test("addDays crosses month end", () => assert.equal(addDays("2026-11-28", 7), "2026-12-05"));

test("follow-ups due, and closed apps never due", () => {
  const a = newApp({ status: "applied" }, "2026-11-01");
  assert.equal(due([a], "2026-11-08").length, 1);
  assert.equal(due([a], "2026-11-07").length, 0);
  assert.equal(due([setStatus(a, "rejected")], "2026-12-01").length, 0);
  assert.equal(followedUp(a, "2026-11-08").followUpAt, "2026-11-15");
});

test("adding an interview moves applied to interviewing and lists it upcoming", () => {
  const a = addInterview(newApp({ status: "applied" }, "2026-11-01"), { at: "2026-11-20T10:00", round: "HR" });
  assert.equal(a.status, "interview");
  assert.equal(a.followUpAt, "");
  assert.equal(upcoming([a], "2026-11-16")[0].round, "HR");
  assert.equal(upcoming([a], "2026-11-21").length, 0);
});
