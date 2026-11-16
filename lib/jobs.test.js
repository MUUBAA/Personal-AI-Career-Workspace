import test from "node:test";
import assert from "node:assert";
import { compat, dedupe, expRange, filterJobs, job, lpa, mode } from "./jobs.js";

const NOW = Date.parse("2026-11-16T00:00:00Z");

test("work mode and experience are parsed from text", () => {
  assert.equal(mode("Hybrid - Bengaluru"), "hybrid");
  assert.equal(mode("Work from home"), "remote");
  assert.deepEqual(expRange("3-5 years of experience"), { expMin: 3, expMax: 5 });
  assert.deepEqual(expRange("4+ yrs in React"), { expMin: 4, expMax: null });
});

test("salary converts to lakh INR per annum", () => {
  assert.deepEqual(lpa({ salaryMin: 25000, salaryMax: 40000, currency: "INR", period: "monthly" }), [3, 4.8]);
  assert.deepEqual(lpa({ salaryMin: 100000, salaryMax: null, currency: "USD", period: "year" }), [85, 85]);
  assert.equal(lpa({ salaryMin: 5, currency: "XYZ" }), null);
});

test("dedupe merges the same role across boards and keeps all sources", () => {
  const a = job({ source: "Himalayas", title: "Senior React Developer", company: "Acme Technologies Pvt Ltd", url: "u1", desc: "short" });
  const b = job({ source: "Jobicy", title: "Sr. React Developer", company: "Acme", url: "u2", desc: "a much longer description", salaryMin: 10, currency: "USD" });
  const c = job({ source: "Jobicy", title: "Node Developer", company: "Acme", url: "u3" });
  const out = dedupe([a, b, c]);
  assert.equal(out.length, 2);
  const m = out.find((x) => x.title.includes("React"));
  assert.deepEqual(m.sources.sort(), ["Himalayas", "Jobicy"]);
  assert.equal(m.desc, "a much longer description");
  assert.equal(m.alt[0].url, "u1");
});

test("region and techs are derived", () => {
  const j = job({ title: "Node.js Developer", location: "Pune, Maharashtra, India", desc: "Node.js, Docker and AWS" });
  assert.equal(j.region, "india");
  assert.deepEqual(j.techs.sort(), ["aws", "docker", "node.js"]);
});

test("compatibility uses skills, title and experience", () => {
  const j = job({ title: "React Developer", desc: "React and Docker, 3-5 years" });
  const strong = compat(j, { profileText: "React Docker", roles: ["React Full Stack Developer"], years: 4 });
  const weak = compat(j, { profileText: "Java", roles: ["Data Analyst"], years: 1 });
  assert.equal(strong.pct, 100);
  assert.ok(weak.pct < 30);
  assert.deepEqual(weak.missing.sort(), ["docker", "react"]);
});

test("filters combine", () => {
  const list = [
    job({ title: "React Dev", company: "A", location: "Chennai, India", workMode: "onsite", posted: "2026-11-14", desc: "react 2-4 years", salaryMin: 50000, salaryMax: 80000, currency: "INR", period: "monthly" }),
    job({ title: "Go Dev", company: "B", location: "Berlin", workMode: "remote", posted: "2026-09-01", desc: "go" }),
  ];
  assert.equal(filterJobs(list, { region: "india" }, NOW).length, 1);
  assert.equal(filterJobs(list, { modes: ["remote"] }, NOW)[0].company, "B");
  assert.equal(filterJobs(list, { days: 7 }, NOW).length, 1);
  assert.equal(filterJobs(list, { minLpa: 9 }, NOW).length, 1);
  assert.equal(filterJobs(list, { minLpa: 10 }, NOW).length, 0);
  assert.equal(filterJobs(list, { myYears: 7 }, NOW).length, 2);
  assert.equal(filterJobs(list, { myYears: 8 }, NOW).length, 1); // far over the range
  assert.equal(filterJobs(list, { myYears: 1 }, NOW).length, 2);
  assert.equal(filterJobs(list, { myYears: 0 }, NOW).length, 1);
  assert.equal(filterJobs(list, { techs: ["react"] }, NOW).length, 1);
});

import { robotsPermit, fromJsonLd } from "./fetchpage.js";

test("robots.txt rules for * are honoured, longest match wins", () => {
  const txt = "User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /jobs/\nAllow: /jobs/public/\nDisallow: /*.pdf$";
  assert.equal(robotsPermit(txt, "/jobs/123"), false);
  assert.equal(robotsPermit(txt, "/jobs/public/123"), true);
  assert.equal(robotsPermit(txt, "/careers/1"), true);
  assert.equal(robotsPermit(txt, "/x/file.pdf"), false);
  assert.equal(robotsPermit("", "/anything"), true);
});

test("schema.org JobPosting maps to the common model", () => {
  const j = fromJsonLd({
    title: "Backend Engineer", hiringOrganization: { name: "Acme" }, employmentType: "FULL_TIME",
    jobLocation: [{ address: { addressLocality: "Pune", addressCountry: "IN" } }],
    baseSalary: { currency: "INR", value: { minValue: 1200000, maxValue: 1800000, unitText: "YEAR" } },
    datePosted: "2026-11-01", validThrough: "2026-12-01", description: "<p>Node.js &amp; AWS</p>",
  }, "https://acme.example/jobs/1");
  assert.equal(j.company, "Acme");
  assert.equal(j.type, "full-time");
  assert.equal(j.location, "Pune, IN");
  assert.equal(j.desc, "Node.js & AWS");
  assert.deepEqual(j.techs.sort(), ["aws", "node.js"]);
});
