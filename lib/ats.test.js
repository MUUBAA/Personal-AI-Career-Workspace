import test from "node:test";
import assert from "node:assert";
import { analyze, expRange, extractJd, has, jobMatch, kwHas, mergeJd, parseRange, similarity } from "./ats.js";

const NOW = 2026 * 12 + 10; // Nov 2026
const resume = {
  name: "Ravi Kumar", email: "ravi@example.com", phone: "9876543210", location: "Chennai", links: "linkedin.com/in/ravi",
  summary: "React full stack developer with 4 years building web apps.", skills: "React, TypeScript, Node.js, C#, SQL Server",
  jobs: [
    { role: "Software Engineer", company: "Acme", dates: "Jan 2022 - Present", bullets: "Built React dashboards used by 200 sales staff\nDesigned Node.js REST APIs serving 1M requests a day\nworked on bug fixes" },
    { role: "Junior Developer", company: "Beta", dates: "06/2020 - 12/2021", bullets: "Developed C# services for billing\nWrote SQL Server reports for finance" },
  ],
  projects: "Job tracker in Next.js and Node.js with React", education: "B.E. Computer Science, Anna University, 2020",
};
const JD = `React Full Stack Developer
Requirements:
- 3+ years with React, Node.js and TypeScript
- Docker and CI/CD pipelines
Nice to have:
- Azure
- Unit testing with Jest`;

test("aliases match common spellings", () => {
  assert.ok(has("Worked with NodeJS", "node.js"));
  assert.ok(has("ASP.NET Core APIs", ".net"));
  assert.ok(!has("nodes and graphs", "node.js"));
});

test("JD extraction splits required and preferred", () => {
  const j = extractJd(JD);
  assert.equal(j.title, "React Full Stack Developer");
  assert.equal(j.minYears, 3);
  for (const k of ["react", "node.js", "typescript", "docker", "ci/cd"]) assert.ok(j.required.includes(k), k);
  assert.ok(j.preferred.includes("azure"));
  assert.ok(!j.required.includes("azure"));
  assert.equal(extractJd(`React Developer\nAbout the role: We are hiring a person to build apps\n${JD}`).title, "React Developer");
});

test("AI lists merge with rule floor and cannot drop dictionary skills", () => {
  const m = mergeJd(extractJd(JD), { title: "Full Stack Dev", required: ["React", "Microservices"], preferred: ["Docker", "Bachelor's degree"], min_years: "4" });
  assert.ok(!m.preferred.some((k) => k.includes("bachelor")));
  assert.ok(m.required.includes("microservices") && m.required.includes("typescript"));
  assert.ok(m.preferred.includes("docker") && !m.required.includes("docker"));
  assert.equal(m.minYears, 4);
});

test("date ranges parse in common formats and flag bad ones", () => {
  assert.ok(parseRange("Jan 2022 - Present", NOW).ok);
  assert.ok(parseRange("06/2020 – 12/2021", NOW).ok);
  assert.ok(parseRange("2019-2021", NOW).ok);
  assert.ok(parseRange("01/2022-06/2023", NOW).ok);
  assert.ok(!parseRange("since last year", NOW).ok);
  assert.equal(parseRange("Jan 2022 - Present", NOW).end, NOW);
});

test("similarity is higher for related text", () => {
  assert.ok(similarity("react node api developer", "built react apps and node apis") > similarity("react node api developer", "accounting and payroll"));
});

test("full analysis is deterministic and evidence-based", () => {
  const a = analyze({ d: resume, resumeName: "React Full Stack Developer", jd: JD, now: NOW });
  const b = analyze({ d: resume, resumeName: "React Full Stack Developer", jd: JD, now: NOW });
  assert.deepEqual(a, b);
  assert.ok(a.total > 40 && a.total < 95, `total ${a.total}`);
  assert.deepEqual(a.kw.missingReq.sort(), ["ci/cd", "docker"]);
  assert.ok(a.kw.missingPref.includes("azure"));
  assert.equal(a.categories.find((c) => c.key === "title").pct, 100);
  assert.ok(a.issues.some((i) => i.type === 4 && i.evidence.includes("worked on bug fixes")));
  assert.ok(a.issues.some((i) => i.type === 8 && /Mixed date formats/.test(i.text)));
  assert.equal(a.years.years, 6.5);
});

test("no JD scores only resume-quality categories", () => {
  const a = analyze({ d: resume, now: NOW });
  assert.equal(a.hasJd, false);
  assert.equal(a.categories.find((c) => c.key === "keywords").pct, null);
  assert.ok(a.total > 0);
});

test("bad dates, glued text and placeholders are flagged", () => {
  const d = { ...resume, jobs: [{ role: "Dev", company: "X", dates: "2023 - 2021", bullets: "Improved speed by [X%]\nBuilt servicesDeployedOnAzure quickly for the team" }] };
  const a = analyze({ d, now: NOW });
  const types = a.issues.map((i) => i.type);
  assert.ok(types.includes(11) && types.includes(10) && types.includes(5));
});

test("jobMatch still works for the Jobs tab", () => {
  assert.deepEqual(jobMatch("I know react", "react and docker"), { pct: 50, missing: ["docker"] });
  assert.equal(jobMatch("x", "nothing"), null);
});

test("JD parsing: 'is a plus' line is not a heading; years come from experience context", () => {
  const j = extractJd("Backend Developer\nAbout us: a company with 20+ years in business.\nRequirements:\n- React\n- Docker is a plus\n- Node.js\n- 3-5 years of experience");
  assert.deepEqual(j.required.sort(), ["node.js", "react"]);
  assert.deepEqual(j.preferred, ["docker"]);
  assert.equal(j.minYears, 3);
  assert.deepEqual(expRange("fresher welcome"), { expMin: 0, expMax: 1 });
});

test("degree: the word 'be' in a JD is not a degree requirement", () => {
  const a = analyze({ d: { ...resume, education: "" }, jd: "You will be responsible for APIs. React Developer, React and Node.js", now: NOW });
  assert.ok(!a.issues.some((i) => /degree name/.test(i.text)));
});

test("metrics ignore versions and tech names; URLs aren't garbled; 'till date' parses", () => {
  const d = { ...resume, links: "linkedin.com/in/AbdullahMubasir", jobs: [{ role: "Dev", company: "X", dates: "Jan 2022 till date", bullets: "Built ASP.NET Core 8 services with OAuth2 and HTML5\nMaintained internal admin tooling for support staff\nCut API latency by 40% across 12 services" }] };
  const a = analyze({ d, now: NOW });
  const nm = a.issues.find((i) => /no measurable result/.test(i.text));
  assert.deepEqual(nm?.evidence, ["Built ASP.NET Core 8 services with OAuth2 and HTML5", "Maintained internal admin tooling for support staff"]);
  assert.ok(!a.issues.some((i) => /garbled/.test(i.text)));
  assert.ok(parseRange("Jan 2022 till date", NOW).ok);
});

test("AI keyword phrases match when every word is present; stemming links API/APIs", () => {
  assert.ok(kwHas("Designed REST APIs for design systems", "rest api design"));
  assert.ok(!kwHas("Designed REST APIs", "graphql federation"));
  assert.ok(similarity("tested APIs", "testing API") > 0.9);
});

test("calibration: matching > partial > unrelated resume, in the right bands", () => {
  const jd = "Senior Full Stack Developer\nRequirements:\n- 4+ years of experience building web applications with React, Node.js and TypeScript\n- Design and build REST APIs and microservices, write unit tests, review code\n- Experience with SQL databases, Docker and CI/CD pipelines\n- Collaborate with product, design and QA teams to ship features\nNice to have: Azure, Kafka";
  const base = { name: "Ravi Kumar", email: "ravi@example.com", phone: "9876543210", location: "Chennai", links: "linkedin.com/in/ravi", summary: "", education: "B.E. Computer Science, 2018", projects: "" };
  const mk = (skills, role, bullets) => ({ ...base, skills, jobs: [{ role, company: "Acme", dates: "Jan 2019 - Present", bullets }] });
  const score = (d) => analyze({ d, jd, now: NOW }).total;
  const good = score(mk("React, Node.js, TypeScript, Docker, SQL Server, CI/CD, Jest", "Full Stack Developer", "Built React dashboards used by 200 sales staff\nDesigned Node.js REST APIs and microservices serving 1M requests a day\nWrote unit tests with Jest and set up CI/CD pipelines with Docker\nCollaborated with product and QA teams to ship features every sprint"));
  const partial = score(mk("C#, SQL Server, Git", "Software Developer", "Developed C# services for billing, cutting month-end time by 30%\nWrote SQL Server reports for finance used by 15 analysts\nWorked with QA team on releases"));
  const unrelated = score(mk("Excel, Tally", "Store Manager", "Managed retail store inventory worth 2 crore\nHandled 40 customer complaints a week and cash reconciliation\nPrepared monthly sales reports for regional managers"));
  assert.ok(good >= 70 && good > partial + 30, `good ${good}, partial ${partial}`);
  assert.ok(partial < 45 && unrelated < 45 && unrelated < partial, `partial ${partial}, unrelated ${unrelated}`);
});
