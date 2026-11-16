import test from "node:test";
import assert from "node:assert/strict";
import { checkUrl, dailyTasks, emptyLi, liChecks, liScore, streak } from "./linkedin.js";

const skills = "React, Node.js, TypeScript, ASP.NET Core, SQL Server, Docker";

test("weights add up to 100", () => {
  assert.equal(liChecks(emptyLi).reduce((s, c) => s + c.weight, 0), 100);
  assert.equal(liScore(emptyLi, skills).total, 0);
});

test("profile URL: custom vs LinkedIn's random suffix", () => {
  assert.deepEqual(checkUrl("https://www.linkedin.com/in/ravi-kumar/"), { ok: true, slug: "ravi-kumar", custom: true });
  assert.equal(checkUrl("linkedin.com/in/ravi-kumar-3a91b2104").custom, false);
  assert.equal(checkUrl("https://example.com/in/x").ok, false);
});

test("strong profile scores high and lists no missing skills", () => {
  const li = {
    ...emptyLi, url: "linkedin.com/in/ravi-kumar", role: "Full Stack Developer", location: "Chennai",
    headline: "Full Stack Developer | React | Node.js | ASP.NET Core | building fast, secure web apps for fintech",
    about: `${"I build web apps with React, Node.js, TypeScript, ASP.NET Core, SQL Server and Docker. ".repeat(12)} Cut load time by 40%. Email me at ravi@example.com.`,
    skills: `${skills}, ${Array.from({ length: 26 }, (_, i) => `Skill${i}`).join(", ")}`,
    experience: [{ title: "Developer", company: "Acme", description: "Built payment APIs used by 20k users and improved query speed by 40% across services. ".repeat(3) }],
    certifications: "AZ-900", photo: true, banner: true, openToWork: true, contactInfo: true,
    featured: 2, recommendations: 2, connections: 600, followers: 1200, postsLast30: 4, commentsLast30: 20,
  };
  const s = liScore(li, skills);
  assert.equal(s.total, 100);
  assert.equal(s.label, "All-Star");
  assert.deepEqual(s.missingSkills, []);
});

test("daily tasks: biggest fix first, 3 tasks, stable per day", () => {
  const sc = liScore({ ...emptyLi, role: "Node.js Developer" }, skills);
  const a = dailyTasks(sc, { date: "2026-11-16", companies: ["Razorpay"], skills: ["react"], role: "Node.js Developer" });
  assert.equal(a.length, 3);
  assert.equal(a[0].kind, "Profile fix");
  assert.equal(a[0].id, "fix-e_desc"); // weight 8, tied with conn; earlier in the list wins
  assert.deepEqual(a, dailyTasks(sc, { date: "2026-11-16", companies: ["Razorpay"], skills: ["react"], role: "Node.js Developer" }));
  assert.notDeepEqual(a.slice(1), dailyTasks(sc, { date: "2026-11-17", companies: ["Razorpay"], skills: ["react"] }).slice(1));
});

test("streak counts fully-done days ending today or yesterday", () => {
  const log = { "2026-11-13": { done: 3, total: 3 }, "2026-11-14": { done: 3, total: 3 }, "2026-11-15": { done: 3, total: 3 }, "2026-11-16": { done: 1, total: 3 } };
  assert.equal(streak(log, "2026-11-16"), 3);
  assert.equal(streak({ ...log, "2026-11-16": { done: 3, total: 3 } }, "2026-11-16"), 4);
  assert.equal(streak({}, "2026-11-16"), 0);
});
