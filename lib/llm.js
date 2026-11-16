// Groq (OpenAI-compatible).
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const FALLBACK = process.env.GROQ_FALLBACK_MODEL || "openai/gpt-oss-20b"; // separate free-tier quota

// free tier has a tokens-per-minute cap: wait out short limits once, then try the smaller model
async function call(body, model = MODEL, retried = false) {
  if (!process.env.GROQ_API_KEY) return { error: "GROQ_API_KEY not set" };
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model, ...body }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 429) {
    const wait = Number((j.error?.message || "").match(/try again in ([\d.]+)s/)?.[1] || r.headers.get("retry-after") || 99);
    if (!retried && wait <= 12) { await new Promise((ok) => setTimeout(ok, wait * 1000 + 300)); return call(body, model, true); }
    if (model !== FALLBACK) return call(body, FALLBACK, false);
    return { error: "The free AI quota is busy right now. Wait a minute and try again." };
  }
  if (!r.ok) return { error: j.error?.message || "AI request failed" };
  return { message: j.choices?.[0]?.message || {} };
}

// single prompt -> { text } or { error }
export async function ask(prompt, json = false, temperature) {
  const r = await call({
    messages: [{ role: "user", content: prompt }],
    ...(json && { response_format: { type: "json_object" } }),
    ...(temperature !== undefined && { temperature }),
  });
  return r.error ? r : { text: r.message.content || "" };
}

// multi-turn with tool calling -> { message } (may contain tool_calls) or { error }
export const chat = (messages, tools, temperature = 0.2) => call({ messages, tools, tool_choice: "auto", temperature });
