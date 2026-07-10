/**
 * Provider-agnostic Claude wrapper — every AI call in this app goes through
 * here (per the "one provider-agnostic wrapper" rule), plain fetch against
 * the Messages API, no SDK. Server-only. Callers get NOT_CONFIGURED back
 * rather than a thrown error so demo mode / no-key dev still works.
 */
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

export const CLAUDE_CONFIGURED = Boolean(API_KEY);

export interface ClaudeResult {
  ok: boolean;
  text?: string;
  error?: string;
}

export async function complete(system: string, userText: string, maxTokens = 1024): Promise<ClaudeResult> {
  if (!CLAUDE_CONFIGURED) {
    return { ok: false, error: "ANTHROPIC_API_KEY not configured" };
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": API_KEY as string,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userText }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `Claude API ${res.status}: ${body.slice(0, 200)}` };
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = data.content?.find((c) => c.type === "text")?.text;
  return text ? { ok: true, text } : { ok: false, error: "No text content in Claude response" };
}
