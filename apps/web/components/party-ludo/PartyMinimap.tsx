"use client";
import { character, type GameState, type ThemePack } from "@ludo/engine";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PartyBoardRenderer as BoardRenderer } from "@/lib/party-ludo/PartyBoardRenderer";
import { COL_W, tilePos } from "@/lib/board/layout";
import { tileColor } from "@/lib/visuals";

export function PartyMinimap({ pack, state, renderer }: { pack: ThemePack; state: GameState; renderer: BoardRenderer | null }) {
  const [cam, setCam] = useState({ x0: 0, x1: 0 });
  const svg = useRef<SVGSVGElement>(null);
  const b = state.board;
  const pts = useMemo(() => b.tiles.map((t) => ({ t, ...tilePos(t) })), [b]);
  const minY = Math.min(...pts.map((p) => p.y)) - 40;
  const maxY = Math.max(...pts.map((p) => p.y)) + 40;
  const width = (b.cols + 2) * COL_W;

  useEffect(() => {
    if (!renderer) return;
    const id = setInterval(() => {
      const v = renderer.cameraView();
      setCam((c) => (Math.abs(c.x0 - v.x0) > 2 || Math.abs(c.x1 - v.x1) > 2 ? v : c));
    }, 120);
    return () => clearInterval(id);
  }, [renderer]);

  const pan = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect();
    renderer?.panTo(-COL_W + ((clientX - r.left) / r.width) * width);
  };

  return (
    <svg ref={svg} viewBox={`${-COL_W} ${minY} ${width} ${maxY - minY}`} preserveAspectRatio="none"
      className="h-full w-full cursor-pointer" onPointerDown={(e) => pan(e.clientX)}
      onPointerMove={(e) => e.buttons && pan(e.clientX)} aria-label="Board overview">
      {pts.map(({ t, x, y }) =>
        t.next.map((n) => <line key={`${t.id}-${n}`} x1={x} y1={y} x2={pts[n].x} y2={pts[n].y} stroke="rgba(167,139,250,.35)" strokeWidth={10} />),
      )}
      {pts.map(({ t, x, y }) => {
        const def = pack.tiles.find((d) => d.id === t.type);
        const special = def && def.base !== "normal";
        return <circle key={t.id} cx={x} cy={y} r={t.finish ? 40 : 18} fill={t.finish ? "#f0abfc" : special ? tileColor(def) : "rgba(196,181,253,.35)"} />;
      })}
      <rect x={cam.x0} y={minY} width={Math.max(0, cam.x1 - cam.x0)} height={maxY - minY} fill="rgba(255,255,255,.07)"
        stroke="rgba(255,255,255,.55)" strokeWidth={12} rx={30} />
      {state.players.map((p) => {
        const t = pts[p.tile];
        const c = character(pack, p.character);
        return <circle key={p.seat} cx={t.x} cy={t.y} r={44} fill={c.color} stroke="#fff" strokeWidth={10} />;
      })}
    </svg>
  );
}
