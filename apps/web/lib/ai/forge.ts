import Anthropic from "@anthropic-ai/sdk";
import type { ThemePack } from "@ludo/engine";
import { autoBalance, pirateFixture, validatePack, type BalanceSummary } from "@ludo/themepack";
import { paintWorld } from "./art";
import { FORGE_SYSTEM, forgeUserPrompt, repairPrompt } from "./prompt";

export const MODEL = "claude-opus-5-5";
const MAX_REPAIRS = 2;

export type ForgeEvent =
  | { stage: "design"; attempt: number }
  | { stage: "invalid"; errors: string[] }
  | { stage: "valid"; name: string; warnings: string[] }
  | { stage: "balance"; before: BalanceSummary; after: BalanceSummary; changes: string[] }
  | { stage: "art"; status: "painting" | "done" | "skipped"; count?: number }
  | { stage: "done"; pack: ThemePack }
  | { stage: "error"; message: string };

/** Pulls the JSON object out of the model's text, tolerating stray fences. */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON object in response");
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * The whole pipeline: design → validate (→ repair) → simulate & balance → paint.
 * Emits progress events as it goes.
 */
export async function forgeWorld(theme: string, emit: (e: ForgeEvent) => void, opts: { mock?: boolean } = {}) {
  let pack: ThemePack;

  if (opts.mock) {
    emit({ stage: "design", attempt: 1 });
    await new Promise((r) => setTimeout(r, 1200));
    pack = structuredClone(pirateFixture);
    pack.id = `${pack.id}-${Date.now().toString(36)}`;
    const v = validatePack(pack);
    if (!v.ok) return emit({ stage: "error", message: v.errors.join("; ") });
    emit({ stage: "valid", name: pack.world.name, warnings: v.warnings });
  } else {
    const client = new Anthropic();
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: forgeUserPrompt(theme) }];
    let result: ThemePack | null = null;

    for (let attempt = 1; attempt <= MAX_REPAIRS + 1 && !result; attempt++) {
      emit({ stage: "design", attempt });
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: [{ type: "text", text: FORGE_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages,
      });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === "refusal") {
        return emit({ stage: "error", message: "That theme couldn't be turned into a world. Try describing it differently." });
      }
      if (msg.stop_reason === "max_tokens") {
        return emit({ stage: "error", message: "The world description ran too long. Try a simpler theme." });
      }
      const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      // Keep the full assistant turn (thinking included) so a repair continues the same conversation.
      messages.push({ role: "assistant", content: msg.content });

      let json: unknown;
      try {
        json = extractJson(text);
      } catch (e) {
        const errors = [`Response was not valid JSON (${(e as Error).message})`];
        emit({ stage: "invalid", errors });
        messages.push({ role: "user", content: repairPrompt(errors) });
        continue;
      }
      if (json && typeof json === "object" && "rejected" in json) {
        return emit({ stage: "error", message: String((json as { rejected: unknown }).rejected) });
      }
      const v = validatePack(json);
      if (v.ok) {
        result = v.pack;
        emit({ stage: "valid", name: v.pack.world.name, warnings: v.warnings });
      } else {
        emit({ stage: "invalid", errors: v.errors });
        messages.push({ role: "user", content: repairPrompt(v.errors) });
      }
    }
    if (!result) return emit({ stage: "error", message: "Couldn't produce a valid world after several tries. Please try again." });
    pack = result;
    pack.id = `${pack.id}-${Date.now().toString(36)}`;
  }

  const b = autoBalance(pack, { games: 400, rounds: 6 });
  pack = b.pack;
  emit({ stage: "balance", before: b.before, after: b.after, changes: b.changes });

  if (process.env.FAL_KEY && !opts.mock) {
    emit({ stage: "art", status: "painting" });
    const art = await paintWorld(pack);
    pack.art.backgroundUrl = art.background;
    pack.art.portraits = art.portraits;
    emit({ stage: "art", status: "done", count: Object.keys(art.portraits).length + (art.background ? 1 : 0) });
  } else {
    emit({ stage: "art", status: "skipped" });
  }

  emit({ stage: "done", pack });
}

export function forgeErrorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.";
  if (err instanceof Anthropic.RateLimitError) return "The AI is busy right now (rate limited). Try again in a minute.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the AI service. Check your connection.";
  if (err instanceof Anthropic.APIError) return `AI service error (${err.status}). Try again.`;
  return "Something went wrong while forging the world.";
}
