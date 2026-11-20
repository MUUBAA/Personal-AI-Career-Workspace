import test from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES, TEMPLATE_CATS, fillTemplate } from "./linkedin-templates.js";

const vars = { name: "Priya", company: "Razorpay", role: "Full Stack Developer", skill: "React", me: "Abdullah" };

test("20+ templates, every category used, no placeholder left unfilled", () => {
  assert.ok(TEMPLATES.length >= 20);
  for (const [k] of TEMPLATE_CATS) assert.ok(TEMPLATES.some((t) => t.cat === k), k);
  for (const t of TEMPLATES) {
    assert.ok(!/[{}]/.test(fillTemplate(t.text, vars)), t.title);
    assert.ok(!/[{}]/.test(fillTemplate(t.text, {})), `${t.title} with empty fields`);
  }
});

test("connection notes fit LinkedIn's 200-character limit; empty sign-off is dropped", () => {
  for (const t of TEMPLATES.filter((x) => x.cat === "connect")) assert.ok(fillTemplate(t.text, vars).length <= 200, t.title);
  assert.ok(!fillTemplate("Hi {name}, hello. – {me}", { name: "A" }).endsWith("–"));
});
