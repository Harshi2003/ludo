"use client";
import type { ThemePack } from "@ludo/engine";
import { useEffect } from "react";
import { sceneOf, type Scene } from "./visuals";

const SCENE: Record<Scene, { gold: string; title: [string, string, string]; cta: string; human: string }> = {
  fantasy: { gold: "#fcd34d", title: ["#fff7d6", "#fcd34d", "#c084fc"], cta: "Begin the battle", human: "🧙 Human" },
  city: { gold: "#ffb547", title: ["#fff1e6", "#ffb547", "#ff5a36"], cta: "Start the race", human: "🧑 Human" },
  candy: { gold: "#ffd447", title: ["#ffffff", "#ffc2e2", "#ff4fa3"], cta: "Let the sugar war begin", human: "🍬 Human" },
};

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number) {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

const alpha = (hex: string, a: number) => `rgb(${rgb(hex).join(" ")} / ${a})`;

export interface WorldTheme {
  scene: Scene;
  cta: string;
  human: string;
  vars: Record<string, string>;
}

/** CSS variables and copy that make every menu and HUD wear the selected world's colours. */
export function worldTheme(pack: ThemePack): WorldTheme {
  const p = pack.art.palette;
  const scene = sceneOf(pack);
  const s = SCENE[scene];
  return {
    scene,
    cta: s.cta,
    human: s.human,
    vars: {
      "--bg": p.bg,
      "--surface": p.surface,
      "--primary": p.primary,
      "--accent": p.accent,
      "--text": p.text,
      "--muted": mix(p.text, p.bg, 0.38),
      "--gold": s.gold,
      "--glass-a": alpha(mix(p.surface, p.primary, 0.1), 0.74),
      "--glass-b": alpha(mix(p.bg, p.surface, 0.5), 0.8),
      "--glass-border": alpha(mix(p.primary, "#ffffff", 0.35), 0.2),
      "--title-a": s.title[0],
      "--title-b": s.title[1],
      "--title-c": s.title[2],
      "--pip-a": mix(p.primary, "#ffffff", 0.3),
      "--pip-b": mix(p.primary, "#000000", 0.55),
      "--face-c": mix(p.primary, "#ffffff", 0.72),
    },
  };
}

/** Applies a world's theme to the whole document while mounted (body background included). */
export function useWorldTheme(pack: ThemePack) {
  useEffect(() => {
    const root = document.documentElement;
    const { vars, scene } = worldTheme(pack);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    root.dataset.scene = scene;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", pack.art.palette.bg);
  }, [pack]);
}
