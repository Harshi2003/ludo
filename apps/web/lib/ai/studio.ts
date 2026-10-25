"use client";
import { useSyncExternalStore } from "react";

/** Client-side jobs that call Bitdeer during a game. */
export type LiveTask = "narrator" | "rival" | "oracle" | "saga";

export interface TaskStats {
  model: string;
  calls: number;
  failed: number;
  totalMs: number;
  promptTokens: number;
  completionTokens: number;
}

export interface StudioInfo {
  enabled: boolean;
  provider: string;
  routing: Record<string, string>;
}

const empty = (): TaskStats => ({ model: "", calls: 0, failed: 0, totalMs: 0, promptTokens: 0, completionTokens: 0 });

let info: StudioInfo = { enabled: false, provider: "Bitdeer AI Model Studio", routing: {} };
let stats: Record<LiveTask, TaskStats> = { narrator: empty(), rival: empty(), oracle: empty(), saga: empty() };
let snapshot = { info, stats };
const subs = new Set<() => void>();
const publish = () => {
  snapshot = { info, stats };
  subs.forEach((f) => f());
};

let probing: Promise<StudioInfo> | null = null;
/** Asks the server once whether Bitdeer is configured and which model runs each job. */
export function loadStudio(): Promise<StudioInfo> {
  probing ??= fetch("/api/narrate")
    .then((r) => r.json())
    .then((j: Partial<StudioInfo>) => {
      info = { enabled: !!j.enabled, provider: j.provider ?? info.provider, routing: j.routing ?? {} };
      publish();
      return info;
    })
    .catch(() => info);
  return probing;
}

export function resetStudioStats() {
  stats = { narrator: empty(), rival: empty(), oracle: empty(), saga: empty() };
  publish();
}

type Reply = { model?: string; ms?: number; usage?: { prompt_tokens: number; completion_tokens: number } | null };

/** POSTs to a Bitdeer-backed route and records the call. Returns null on any failure or timeout. */
export async function callStudio<T>(task: LiveTask, url: string, body: unknown, timeoutMs: number): Promise<(T & Reply) | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const j = (await res.json()) as T & Reply;
    if (!res.ok) throw new Error("failed");
    const s = stats[task];
    stats = {
      ...stats,
      [task]: {
        model: j.model ?? s.model,
        calls: s.calls + 1,
        failed: s.failed,
        totalMs: s.totalMs + (j.ms ?? 0),
        promptTokens: s.promptTokens + (j.usage?.prompt_tokens ?? 0),
        completionTokens: s.completionTokens + (j.usage?.completion_tokens ?? 0),
      },
    };
    publish();
    return j;
  } catch {
    stats = { ...stats, [task]: { ...stats[task], calls: stats[task].calls + 1, failed: stats[task].failed + 1 } };
    publish();
    return null;
  }
}

export function useStudio() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => snapshot,
    () => snapshot,
  );
}

const PREFS = { narrator: "ludo:narrator", rival: "ludo:rivals" } as const;
export function readPref(k: keyof typeof PREFS): boolean {
  try {
    return localStorage.getItem(PREFS[k]) !== "0";
  } catch {
    return true;
  }
}
export function writePref(k: keyof typeof PREFS, v: boolean) {
  try {
    localStorage.setItem(PREFS[k], v ? "1" : "0");
  } catch {}
}
