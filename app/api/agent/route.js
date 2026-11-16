import { SYSTEM, TOOLS } from "../../../lib/agent";
import { chat } from "../../../lib/llm";

export const maxDuration = 60;
const NAMES = new Set(TOOLS.map((t) => t.function.name));
const str = (v, n) => String(v ?? "").slice(0, n);

// keep only well-formed user/assistant/tool turns; the system prompt is always ours, never the client's
function sanitize(list) {
  const out = [];
  for (const m of Array.isArray(list) ? list.slice(-40) : []) {
    if (m?.role === "user") out.push({ role: "user", content: str(m.content, 4000) });
    else if (m?.role === "assistant") {
      const calls = (Array.isArray(m.tool_calls) ? m.tool_calls : []).filter((c) => NAMES.has(c?.function?.name)).map((c) => ({ id: str(c.id, 100), type: "function", function: { name: c.function.name, arguments: str(c.function.arguments, 2000) } }));
      out.push({ role: "assistant", content: str(m.content, 6000), ...(calls.length && { tool_calls: calls }) });
    } else if (m?.role === "tool") out.push({ role: "tool", tool_call_id: str(m.tool_call_id, 100), content: str(m.content, 9000) });
  }
  // a trimmed history must start at a user turn so every tool result still follows its call
  const first = out.findIndex((m) => m.role === "user");
  const msgs = first < 0 ? [] : out.slice(first);
  // token budget: tool results from earlier turns are cut short; the model already summarised them
  const lastUser = msgs.map((m) => m.role).lastIndexOf("user");
  return msgs.map((m, i) => (m.role === "tool" && i < lastUser && m.content.length > 600 ? { ...m, content: `${m.content.slice(0, 600)}…(trimmed)` } : m));
}

export async function POST(req) {
  const { messages } = await req.json().catch(() => ({}));
  const msgs = sanitize(messages);
  if (!msgs.length) return Response.json({ error: "Say something first" }, { status: 400 });
  const r = await chat([{ role: "system", content: SYSTEM(new Date().toISOString().slice(0, 10)) }, ...msgs], TOOLS);
  if (r.error) return Response.json(r, { status: 502 });
  const m = r.message;
  const calls = (m.tool_calls || []).filter((c) => NAMES.has(c.function?.name)).slice(0, 5);
  return Response.json({ message: { role: "assistant", content: m.content || "", ...(calls.length && { tool_calls: calls.map((c) => ({ id: c.id, type: "function", function: { name: c.function.name, arguments: c.function.arguments || "{}" } })) }) } });
}
