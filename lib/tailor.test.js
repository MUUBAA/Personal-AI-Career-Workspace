import test from "node:test";
import assert from "node:assert";
import { apply, buildSuggestions, check, gapReport, items, skillsSuggestion } from "./tailor.js";
import { clean } from "./store.js";

const profile = clean({
  name: "Ravi", summary: "Full stack developer.", skills: "React, Node.js, C#, Docker",
  jobs: [
    { role: "Engineer", company: "Acme", dates: "2022 - Present", bullets: "Built React dashboards for 200 users\nDeployed services with Docker\nWrote unit tests" },
    { role: "Dev", company: "Beta", dates: "2020 - 2021", bullets: "Developed C# billing services" },
  ],
  projects: "Job tracker in Next.js",
});
const resume = clean({ ...profile, skills: "C#, React", jobs: [{ ...profile.jobs[0], bullets: "Built React dashboards for 200 users" }, profile.jobs[1]] });
const info = { required: ["react", "docker", "kubernetes"], preferred: ["azure"] };

test("gap report separates resume, profile-only and genuine gaps", () => {
  const g = gapReport(info, resume, profile);
  assert.deepEqual(g.inResume.map((x) => x.k), ["react"]);
  assert.deepEqual(g.inProfile.map((x) => x.k), ["docker"]);
  assert.deepEqual(g.gaps.map((x) => x.k).sort(), ["azure", "kubernetes"]);
});

test("items find master bullets missing from the resume for the same job", () => {
  const { list, extra } = items(resume, profile);
  assert.equal(list[0].id, "j0b0");
  assert.deepEqual(extra.map((x) => x.text), ["Deployed services with Docker", "Wrote unit tests"]);
});

test("guardrails block invented skills and numbers, warn on cross-job skills", () => {
  const ctx = { profile, jobText: "Developed C# billing services", gaps: ["kubernetes"] };
  assert.equal(check("Developed C# billing services", "Developed C# billing services on Kubernetes", ctx).status, "blocked");
  assert.equal(check("Developed C# billing services", "Developed C# billing services, cutting costs 30%", ctx).status, "blocked");
  assert.equal(check("Developed C# billing services", "Developed C# billing services in Docker containers", ctx).status, "warn");
  assert.equal(check("Developed C# billing services", "Engineered C# billing services for finance", ctx).status, "ok");
  assert.equal(check("Developed C# billing services", "Built C# billing services, cutting costs [X%]", ctx).status, "ok");
});

test("skills suggestion reorders and only adds profile-backed keywords", () => {
  const s = skillsSuggestion(resume, info, profile);
  assert.equal(s.after, "React, C#, Docker");
  assert.ok(!/kubernetes|azure/i.test(s.after));
});

test("AI output is validated, unknown ids ignored, adds copied verbatim", () => {
  const ai = {
    summary: { after: "Full stack developer focused on React and Kubernetes.", reason: "x" },
    bullets: [{ id: "j1b0", after: "Engineered C# billing services" }, { id: "zz", after: "nope" }],
    add: [{ id: "m0" }],
  };
  const s = buildSuggestions(ai, resume, profile, info, ["kubernetes", "azure"]);
  assert.equal(s.find((x) => x.id === "summary").check.status, "blocked");
  assert.equal(s.find((x) => x.id === "j1b0").check.status, "ok");
  assert.equal(s.find((x) => x.id === "m0").after, "Deployed services with Docker");
  assert.ok(!s.some((x) => x.id === "zz"));
});

test("apply changes a copy and leaves the original untouched", () => {
  const before = JSON.stringify(resume);
  const s = buildSuggestions({ bullets: [{ id: "j1b0", after: "Engineered C# billing services" }], add: [{ id: "m0" }] }, resume, profile, info, []);
  const out = apply(resume, s);
  assert.equal(JSON.stringify(resume), before);
  assert.equal(out.jobs[1].bullets, "Engineered C# billing services");
  assert.equal(out.jobs[0].bullets, "Built React dashboards for 200 users\nDeployed services with Docker");
  assert.equal(out.skills, "React, C#, Docker");
});
