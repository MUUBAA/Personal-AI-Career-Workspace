import test from "node:test";
import assert from "node:assert";
import { NEEDS_APPROVAL, TOOLS, compareVersions, skillGaps, validateCall } from "./agent.js";
import { addVersion, clean, newResume } from "./store.js";

test("validator rejects unknown tools, args, bad types, enums and unknown refs", () => {
  assert.equal(validateCall("delete_everything", "{}").ok, false);
  assert.equal(validateCall("search_jobs", '{"min_match": 150}').ok, false);
  assert.equal(validateCall("search_jobs", '{"hack": 1}').ok, false);
  assert.equal(validateCall("search_jobs", '{"region": "mars"}').ok, false);
  assert.equal(validateCall("search_jobs", "not json").ok, false);
  assert.equal(validateCall("save_to_wishlist", '{"job_ref": "J9"}', { J1: {} }).ok, false);
  assert.equal(validateCall("draft_email", '{"app_ref": "J1", "kind": "followup"}', { J1: {} }).ok, false);
  const ok = validateCall("save_to_wishlist", '{"job_ref": "j1"}', { J1: {} });
  assert.deepEqual(ok, { ok: true, args: { job_ref: "J1" } });
  assert.ok(validateCall("search_jobs", '{"min_match": 80, "limit": null}').ok);
});

test("every write/navigation tool needs approval and exists", () => {
  const names = TOOLS.map((t) => t.function.name);
  for (const n of NEEDS_APPROVAL) assert.ok(names.includes(n));
  assert.ok(!NEEDS_APPROVAL.has("search_jobs"));
});

test("skill gaps rank missing skills by how many jobs ask for them", () => {
  const profile = clean({ skills: "React, Node.js" });
  const jobs = [
    { title: "Dev", company: "A", desc: "React, Docker, Kubernetes" },
    { title: "Dev", company: "B", desc: "Docker and AWS" },
    { title: "Dev", company: "C", desc: "Node.js, Docker" },
  ];
  const g = skillGaps(profile, jobs, 2);
  assert.equal(g.gaps[0].skill, "docker");
  assert.equal(g.gaps[0].jobs, 3);
  assert.equal(g.gaps.length, 2);
  assert.ok(!g.gaps.some((x) => ["react", "node.js"].includes(x.skill)));
});

test("version comparison reports skill and bullet changes", () => {
  let r = newResume("x", { skills: "C#, SQL", summary: "Old", jobs: [{ role: "Dev", bullets: "Built APIs" }] });
  r = addVersion(r, "v1");
  r = { ...r, d: { ...r.d, skills: "C#, SQL, Docker", summary: "New", jobs: [{ ...r.d.jobs[0], bullets: "Built APIs\nDeployed with Docker" }] } };
  const c = compareVersions(r, 3);
  assert.equal(c.versions.length, 2);
  assert.deepEqual(c.changes[0].skills_added, ["Docker"]);
  assert.deepEqual(c.changes[0].bullets_added, ["deployed with docker"]);
  assert.equal(c.changes[0].summary_changed, true);
  assert.ok(compareVersions(newResume("y", {})).error);
});
