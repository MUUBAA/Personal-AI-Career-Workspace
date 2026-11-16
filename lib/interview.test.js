import test from "node:test";
import assert from "node:assert";
import { bankItem, needsPractice, normalizeQuestions, overall, pickMock } from "./interview.js";

const items = [{ id: "j0b0", text: "Built React dashboards", where: "Engineer" }];

test("questions are cleaned, deduped, and evidence must be real profile items", () => {
  const qs = normalizeQuestions([
    { q: "How does React reconciliation work?", category: "stack", topic: "React", difficulty: "hard", evidence: ["j0b0", "fake"] },
    { q: "How does React reconciliation work?", category: "stack" },
    { q: "Explain Kafka partitions in detail", category: "technical", evidence: ["nope"] },
    { q: "short", category: "hr" },
    { q: "Tell me about a conflict with a teammate", category: "weird" },
  ], items);
  assert.equal(qs.length, 3);
  assert.deepEqual(qs[0].evidence.map((e) => e.text), ["Built React dashboards"]);
  assert.equal(qs[1].gap, true); // no real evidence -> honest gap
  assert.equal(qs[2].category, "technical");
});

test("overall score is computed from the rubric, not taken from AI", () => {
  assert.equal(overall({ relevance: { score: 5 }, structure: { score: 5 }, evidence: { score: 5 }, accuracy: { score: 5 }, communication: { score: 5 } }), 100);
  assert.equal(overall({ relevance: { score: 3 }, structure: { score: 3 } }), 50);
  assert.equal(overall({ relevance: { score: 9 } }), null);
});

test("mock picks a balanced, hard-first set", () => {
  const q = (category, difficulty) => ({ category, difficulty, q: category + difficulty });
  const m = pickMock([q("technical", "easy"), q("technical", "hard"), q("hr", "medium"), q("design", "hard"), q("stack", "medium")], 4);
  assert.deepEqual(m.map((x) => x.category), ["technical", "stack", "design", "hr"]);
  assert.equal(m[0].difficulty, "hard");
});

test("bank items need practice until scored 60+", () => {
  const b = bankItem({ q: "Q?" });
  assert.ok(needsPractice(b));
  assert.ok(!needsPractice({ ...b, attempts: [{ score: 75 }] }));
  assert.ok(needsPractice({ ...b, attempts: [{ score: 80 }, { score: 40 }] }));
});
