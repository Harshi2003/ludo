import { forgeErrorMessage, forgeWorld, hasBitdeer, hasClaude, type ForgeEvent } from "@/lib/ai/forge";
import { storeWorld } from "@/lib/worldStore";

export const maxDuration = 300;

/** POST { theme, mock? } → NDJSON stream of ForgeEvents. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { theme?: unknown; mock?: unknown };
  const theme = typeof body.theme === "string" ? body.theme.trim() : "";
  const mock = body.mock === true || process.env.FORGE_MOCK === "1";
  if (theme.length < 3) return Response.json({ error: "Describe a theme (at least a few words)." }, { status: 400 });
  if (!mock && !hasBitdeer() && !hasClaude()) {
    return Response.json({ error: "missing_key", message: "AI creation needs BITDEER_API_KEY or ANTHROPIC_API_KEY in apps/web/.env.local." }, { status: 503 });
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (e: ForgeEvent) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {
          open = false; // The tab closed; keep forging so the world still gets saved.
        }
      };
      // AI worlds are saved before the client hears "done", so the library already has them.
      let saving: Promise<void> = Promise.resolve();
      const emit = (e: ForgeEvent) => {
        if (e.stage === "done" && !mock) {
          saving = storeWorld({ pack: e.pack, prompt: theme, createdAt: Date.now(), provider: e.provider, model: e.model })
            .then(() => console.log(`[forge] saved world ${e.pack.id}`))
            .catch((err) => console.error("[forge] couldn't save world", err))
            .finally(() => send(e));
          return;
        }
        send(e);
      };
      try {
        await forgeWorld(theme, emit, { mock });
      } catch (err) {
        console.error("forge failed", err);
        emit({ stage: "error", message: forgeErrorMessage(err) });
      }
      await saving;
      if (open) controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
