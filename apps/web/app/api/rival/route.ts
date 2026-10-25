import { STUDIO, bitdeerChat, replyJson, stripThinking } from "@/lib/ai/bitdeer";

interface RivalBody {
  /** "pick": a bot chooses its own move. "advise": the Oracle recommends one to a human. */
  mode?: "pick" | "advise";
  world?: { name?: string; tagline?: string };
  me?: { name?: string; title?: string; bio?: string };
  /** One line per player: who's where and what they hold. */
  situation?: string[];
  /** The legal moves, in the engine's order. */
  options?: string[];
}

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : "");

/**
 * POST RivalBody → { pick, say, model, ms, usage }.
 * The model only ever chooses among the engine's legal moves; anything else is rejected
 * and the client falls back to the built-in bot, so a bad reply can't break a turn.
 */
export async function POST(req: Request) {
  if (!process.env.BITDEER_API_KEY) return Response.json({ error: "disabled" }, { status: 503 });
  const b = ((await req.json().catch(() => ({}))) ?? {}) as RivalBody;
  const options = (Array.isArray(b.options) ? b.options : []).slice(0, 12).map((o) => clip(o, 200));
  if (options.length < 2) return Response.json({ error: "nothing to choose" }, { status: 400 });
  const situation = (Array.isArray(b.situation) ? b.situation : []).slice(0, 4).map((s) => `- ${clip(s, 200)}`).join("\n");
  const world = `${clip(b.world?.name, 80)} — ${clip(b.world?.tagline, 80)}`;
  const me = `${clip(b.me?.name, 24)}, ${clip(b.me?.title, 48)}`;
  const advise = b.mode === "advise";
  const task = advise ? "oracle" : "rival";

  const system = advise
    ? `You are the Oracle of "${world}", a racing board game: first token to the finish wins; landing on a rival sends them back to their last checkpoint.
You advise the player controlling ${me}. Weigh progress, captures, safety from rivals behind, and tile effects.
Reply with JSON only: {"pick": <option number>, "say": "<why, max 18 words, speak to the player as 'you', no emojis>"}`
    : `You are ${me}, a character in "${world}", a racing board game: first token to the finish wins; landing on a rival sends them back to their last checkpoint.
Personality: ${clip(b.me?.bio, 240)}
Choose your move like a sharp player who stays in character. Weigh progress, captures, safety from rivals behind, and tile effects.
Reply with JSON only: {"pick": <option number>, "say": "<your in-character line about this move, max 14 words, family-friendly, no emojis>"}`;
  const user = `Players:\n${situation}\n\nYour options:\n${options.map((o, i) => `${i}) ${o}`).join("\n")}`;

  try {
    const r = await bitdeerChat(
      [{ role: "system", content: system }, { role: "user", content: user }],
      { model: STUDIO[task], maxTokens: 800, temperature: advise ? 0.4 : 0.8, timeoutMs: 8000, reasoningEffort: "low" },
    );
    const j = replyJson<{ pick?: unknown; say?: unknown }>(r.text);
    const pick = Number(j?.pick);
    if (!Number.isInteger(pick) || pick < 0 || pick >= options.length) {
      return Response.json({ error: "no valid pick", raw: stripThinking(r.text).slice(0, 120) }, { status: 502 });
    }
    const say = typeof j?.say === "string" ? j.say.replace(/^["'“]|["'”]$/g, "").trim().slice(0, 160) : "";
    return Response.json({ pick, say, model: r.model, ms: r.ms, usage: r.usage ?? null });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
