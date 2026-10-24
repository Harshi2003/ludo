import { forgeErrorMessage, forgeWorld, type ForgeEvent } from "@/lib/ai/forge";

export const maxDuration = 300;

/** POST { theme, mock? } → NDJSON stream of ForgeEvents. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { theme?: unknown; mock?: unknown };
  const theme = typeof body.theme === "string" ? body.theme.trim() : "";
  const mock = body.mock === true || process.env.FORGE_MOCK === "1";
  if (theme.length < 3) return Response.json({ error: "Describe a theme (at least a few words)." }, { status: 400 });
  if (!mock && !process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "missing_key", message: "AI creation needs ANTHROPIC_API_KEY in apps/web/.env.local." }, { status: 503 });
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: ForgeEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        await forgeWorld(theme, emit, { mock });
      } catch (err) {
        console.error("forge failed", err);
        emit({ stage: "error", message: forgeErrorMessage(err) });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
