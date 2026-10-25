import { BITDEER_MODEL, bitdeerChat } from "@/lib/ai/bitdeer";

/** A fast catalog model suits one-liners; falls back to the forge model. */
const MODEL = process.env.BITDEER_NARRATOR_MODEL || BITDEER_MODEL;

interface NarrateBody {
  world?: { name?: string; tagline?: string };
  /** "cast": one sportscaster line. "taunt": the speaker trash-talks in character. */
  mode?: "cast" | "taunt";
  speaker?: { name?: string; title?: string; bio?: string };
  /** The last few game log lines, oldest first. */
  moments?: string[];
}

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : "");

/** GET → whether live commentary is available. */
export function GET() {
  return Response.json({ enabled: !!process.env.BITDEER_API_KEY, provider: "Bitdeer AI Model Studio", model: MODEL });
}

/** POST NarrateBody → { line, model, ms, usage }. 503 when no key, so the client just stays quiet. */
export async function POST(req: Request) {
  if (!process.env.BITDEER_API_KEY) return Response.json({ error: "disabled" }, { status: 503 });
  const b = ((await req.json().catch(() => ({}))) ?? {}) as NarrateBody;
  const moments = (Array.isArray(b.moments) ? b.moments : []).slice(-6).map((m) => `- ${clip(m, 160)}`).join("\n");
  if (!moments) return Response.json({ error: "no moments" }, { status: 400 });
  const world = `${clip(b.world?.name, 80)} — ${clip(b.world?.tagline, 80)}`;

  const system = b.mode === "taunt"
    ? `You are ${clip(b.speaker?.name, 24)}, ${clip(b.speaker?.title, 48)}, a character in the board game world "${world}". Personality: ${clip(b.speaker?.bio, 240)}
Reply with ONE short in-character taunt or boast (max 12 words) reacting to what just happened. Playful, family-friendly, no hashtags, no quotes, no emojis.`
    : `You are the hyped live sportscaster for a racing board game set in "${world}". Use the world's flavour and the characters' names.
Reply with ONE punchy commentary line (max 18 words) about the most exciting thing that just happened. Family-friendly, no hashtags, no quotes, no emojis.`;

  try {
    const r = await bitdeerChat(
      [{ role: "system", content: system }, { role: "user", content: `What just happened:\n${moments}` }],
      // GLM spends hidden reasoning tokens from this budget too; leave headroom so the line isn't cut off.
      { model: MODEL, maxTokens: 2000, temperature: 0.95, timeoutMs: 12_000, reasoningEffort: "low" },
    );
    const line = r.text.replace(/<think>[\s\S]*?<\/think>/g, "").trim().split("\n").find((l) => l.trim())?.replace(/^["'“]|["'”]$/g, "").trim();
    if (!line) return Response.json({ error: "empty" }, { status: 502 });
    return Response.json({ line: line.slice(0, 180), model: r.model, ms: r.ms, usage: r.usage ?? null });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
