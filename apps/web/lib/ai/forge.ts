import Anthropic from "@anthropic-ai/sdk";
import type { ThemePack } from "@ludo/engine";
import { autoBalance, pirateFixture, validatePack, type BalanceSummary } from "@ludo/themepack";
import { paintWorld } from "./art";
import { BITDEER_MODEL, BitdeerError, bitdeerChat, type ChatMessage } from "./bitdeer";
import { FORGE_SYSTEM, forgeUserPrompt, repairPrompt } from "./prompt";

export const MODEL = "claude-opus-5-5";
const MAX_REPAIRS = 2;

export type ForgeEvent =
  | { stage: "provider"; provider: string; model: string; fallbackFrom?: string; reason?: string }
  | { stage: "design"; attempt: number }
  | { stage: "invalid"; errors: string[] }
  | { stage: "valid"; name: string; warnings: string[] }
  | { stage: "balance"; before: BalanceSummary; after: BalanceSummary; changes: string[] }
  | { stage: "art"; status: "painting" | "done" | "skipped"; count?: number }
  | { stage: "done"; pack: ThemePack; provider: string; model: string }
  | { stage: "error"; message: string };

/** Pulls the JSON object out of the model's text, tolerating stray fences. */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON object in response");
  return JSON.parse(text.slice(start, end + 1));
}

type Turn = { kind: "text"; text: string } | { kind: "refusal" } | { kind: "too_long" };

/** One model conversation; each call sends a user turn and returns the reply. */
interface Designer {
  provider: string;
  model: string;
  turn(user: string): Promise<Turn>;
}

export const hasBitdeer = () => !!process.env.BITDEER_API_KEY;
export const hasClaude = () => !!process.env.ANTHROPIC_API_KEY;

function bitdeerDesigner(): Designer {
  const messages: ChatMessage[] = [{ role: "system", content: FORGE_SYSTEM }];
  return {
    provider: "Bitdeer AI Model Studio",
    model: BITDEER_MODEL,
    async turn(user) {
      messages.push({ role: "user", content: user });
      const r = await bitdeerChat(messages, { maxTokens: 32000, reasoningEffort: "medium", timeoutMs: 270_000 });
      console.log(`[forge] bitdeer ${r.model} ${r.ms}ms`, r.usage ?? "");
      if (r.finish === "length") return { kind: "too_long" };
      if (r.finish === "content_filter") return { kind: "refusal" };
      messages.push({ role: "assistant", content: r.text });
      return { kind: "text", text: r.text };
    },
  };
}

function claudeDesigner(): Designer {
  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  return {
    provider: "Anthropic",
    model: MODEL,
    async turn(user) {
      messages.push({ role: "user", content: user });
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
      if (msg.stop_reason === "refusal") return { kind: "refusal" };
      if (msg.stop_reason === "max_tokens") return { kind: "too_long" };
      // Keep the full assistant turn (thinking included) so a repair continues the same conversation.
      messages.push({ role: "assistant", content: msg.content });
      return { kind: "text", text: msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("") };
    },
  };
}

/** Outcome of one designer's design → validate → repair loop. `final` errors aren't worth retrying with another provider. */
type Design = { ok: true; pack: ThemePack } | { ok: false; message: string; final: boolean };

async function design(d: Designer, theme: string, emit: (e: ForgeEvent) => void): Promise<Design> {
  let user = forgeUserPrompt(theme);
  for (let attempt = 1; attempt <= MAX_REPAIRS + 1; attempt++) {
    emit({ stage: "design", attempt });
    const t = await d.turn(user);
    if (t.kind === "refusal") return { ok: false, final: true, message: "That theme couldn't be turned into a world. Try describing it differently." };
    if (t.kind === "too_long") return { ok: false, final: false, message: "The world description ran too long. Try a simpler theme." };

    let json: unknown;
    try {
      json = extractJson(t.text);
    } catch (e) {
      const errors = [`Response was not valid JSON (${(e as Error).message})`];
      emit({ stage: "invalid", errors });
      user = repairPrompt(errors);
      continue;
    }
    if (json && typeof json === "object" && "rejected" in json) {
      return { ok: false, final: true, message: String((json as { rejected: unknown }).rejected) };
    }
    const v = validatePack(json);
    if (v.ok) {
      emit({ stage: "valid", name: v.pack.world.name, warnings: v.warnings });
      return { ok: true, pack: v.pack };
    }
    emit({ stage: "invalid", errors: v.errors });
    user = repairPrompt(v.errors);
  }
  return { ok: false, final: false, message: "Couldn't produce a valid world after several tries. Please try again." };
}

/**
 * The whole pipeline: design → validate (→ repair) → simulate & balance → paint.
 * Claude designs first; Bitdeer AI Model Studio takes over if Claude is missing, down, or can't produce a valid world.
 * Emits progress events as it goes.
 */
export async function forgeWorld(theme: string, emit: (e: ForgeEvent) => void, opts: { mock?: boolean } = {}) {
  let pack: ThemePack;
  let used = { provider: "Demo", model: "built-in" };

  if (opts.mock) {
    emit({ stage: "provider", ...used });
    emit({ stage: "design", attempt: 1 });
    await new Promise((r) => setTimeout(r, 1200));
    pack = structuredClone(pirateFixture);
    const v = validatePack(pack);
    if (!v.ok) return emit({ stage: "error", message: v.errors.join("; ") });
    emit({ stage: "valid", name: pack.world.name, warnings: v.warnings });
  } else {
    const chain: (() => Designer)[] = [];
    if (hasClaude()) chain.push(claudeDesigner);
    if (hasBitdeer()) chain.push(bitdeerDesigner);

    let result: Design = { ok: false, final: true, message: "No AI provider is configured." };
    let failed: { provider: string; reason: string } | undefined;
    for (const make of chain) {
      const d = make();
      emit({ stage: "provider", provider: d.provider, model: d.model, fallbackFrom: failed?.provider, reason: failed?.reason });
      try {
        result = await design(d, theme, emit);
      } catch (err) {
        console.error(`[forge] ${d.provider} failed`, err);
        result = { ok: false, final: false, message: forgeErrorMessage(err) };
      }
      if (result.ok) {
        used = { provider: d.provider, model: d.model };
        break;
      }
      if (result.final) break;
      failed = { provider: d.provider, reason: result.message };
    }
    if (!result.ok) return emit({ stage: "error", message: result.message });
    pack = result.pack;
  }
  pack.id = `${pack.id}-${Date.now().toString(36)}`;

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

  emit({ stage: "done", pack, ...used });
}

export function forgeErrorMessage(err: unknown): string {
  if (err instanceof BitdeerError) {
    if (err.status === 401 || err.status === 403) return "The Bitdeer API key was rejected. Check BITDEER_API_KEY.";
    if (err.status === 429) return "Bitdeer is busy right now (rate limited). Try again in a minute.";
    return err.message;
  }
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.";
  if (err instanceof Anthropic.RateLimitError) return "The AI is busy right now (rate limited). Try again in a minute.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the AI service. Check your connection.";
  if (err instanceof Anthropic.APIError) return `AI service error (${err.status}). Try again.`;
  return "Something went wrong while forging the world.";
}
