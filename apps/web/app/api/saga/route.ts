import { STUDIO, bitdeerChat, replyJson } from "@/lib/ai/bitdeer";

interface SagaBody {
  world?: { name?: string; tagline?: string; finish?: string };
  /** One line per player, winner first: name, title, captures, times captured. */
  players?: string[];
  rounds?: number;
  /** The match's big moments in order (captures, ultimates, world events, lead changes). */
  moments?: string[];
}

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : "");

/** POST SagaBody → { title, story, mvp, model, ms, usage }: the match retold as a legend. */
export async function POST(req: Request) {
  if (!process.env.BITDEER_API_KEY) return Response.json({ error: "disabled" }, { status: 503 });
  const b = ((await req.json().catch(() => ({}))) ?? {}) as SagaBody;
  const players = (Array.isArray(b.players) ? b.players : []).slice(0, 4).map((p) => `- ${clip(p, 200)}`).join("\n");
  const moments = (Array.isArray(b.moments) ? b.moments : []).slice(-40).map((m) => `- ${clip(m, 160)}`).join("\n");
  if (!players) return Response.json({ error: "no players" }, { status: 400 });

  const system = `You are the bard of "${clip(b.world?.name, 80)} — ${clip(b.world?.tagline, 80)}". A board game race to the ${clip(b.world?.finish, 60)} just ended.
Retell this match as a short legend in the world's voice, using the real characters and the real moments, in order. Name the turning point.
Reply with JSON only: {"title": "<legend title, max 7 words>", "story": "<3 to 4 vivid sentences, max 90 words, family-friendly>", "mvp": "<the single moment that decided it, max 14 words>"}`;
  const user = `Final standings (winner first), after ${Number(b.rounds) || "?"} rounds:\n${players}\n\nWhat happened:\n${moments || "- A quiet, tense race."}`;

  try {
    const r = await bitdeerChat(
      [{ role: "system", content: system }, { role: "user", content: user }],
      { model: STUDIO.saga, maxTokens: 2500, temperature: 0.9, timeoutMs: 30_000 },
    );
    const j = replyJson<{ title?: unknown; story?: unknown; mvp?: unknown }>(r.text);
    if (typeof j?.story !== "string" || !j.story.trim()) return Response.json({ error: "no story" }, { status: 502 });
    return Response.json({
      title: clip(j.title, 80) || "The Legend of the Race",
      story: j.story.trim().slice(0, 700),
      mvp: clip(j.mvp, 140),
      model: r.model, ms: r.ms, usage: r.usage ?? null,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
