/**
 * Bitdeer AI Model Studio: OpenAI-compatible chat completions over plain HTTP.
 * https://developers.bitdeer.ai/docs/api
 */
export const BITDEER_URL = process.env.BITDEER_BASE_URL ?? "https://api-inference.bitdeer.ai/v1";
export const BITDEER_MODEL = process.env.BITDEER_MODEL ?? "zai-org/GLM-5.3";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class BitdeerError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export interface ChatResult {
  text: string;
  finish: string | null;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
  ms: number;
}

export async function bitdeerChat(
  messages: ChatMessage[],
  opts: { model?: string; maxTokens?: number; temperature?: number; timeoutMs?: number; reasoningEffort?: "low" | "medium" | "high" } = {},
): Promise<ChatResult> {
  const key = process.env.BITDEER_API_KEY;
  if (!key) throw new BitdeerError("BITDEER_API_KEY is not set");
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`${BITDEER_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model ?? BITDEER_MODEL,
        messages,
        max_tokens: opts.maxTokens ?? 16000,
        temperature: opts.temperature ?? 0.8,
        // Reasoning models count hidden thinking against max_tokens; cap it so the answer fits.
        ...(opts.reasoningEffort && { reasoning_effort: opts.reasoningEffort }),
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 180_000),
    });
  } catch (err) {
    throw new BitdeerError(`Couldn't reach Bitdeer (${(err as Error).name})`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new BitdeerError(`Bitdeer returned ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`, res.status);
  }
  const j = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  const choice = j.choices?.[0];
  return {
    text: choice?.message?.content ?? "",
    finish: choice?.finish_reason ?? null,
    model: j.model ?? opts.model ?? BITDEER_MODEL,
    usage: j.usage,
    ms: Date.now() - t0,
  };
}
