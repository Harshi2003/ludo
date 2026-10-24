import type { CharacterDef } from "@ludo/engine";
import { useId } from "react";
import { GlyphSvg } from "@/lib/glyphSvg";

const PATHS: Record<string, React.ReactNode> = {
  fire: (
    <>
      <path d="M50 12 C64 30 78 44 74 64 C71 80 60 88 50 88 C38 88 26 80 26 63 C26 50 34 42 40 32 C41 42 45 48 50 50 C52 38 50 24 50 12 Z" />
      <path d="M50 56 C58 64 60 70 58 76 C56 82 52 84 50 84 C46 84 42 81 42 75 C42 69 46 64 50 56 Z" fill="rgba(0,0,0,.28)" />
    </>
  ),
  water: (
    <>
      <path d="M50 12 C58 30 76 46 76 62 C76 78 64 88 50 88 C36 88 24 78 24 62 C24 46 42 30 50 12 Z" />
      <path d="M36 62 C36 71 42 77 50 78" fill="none" stroke="rgba(0,0,0,.28)" strokeWidth="5" strokeLinecap="round" />
    </>
  ),
  earth: (
    <>
      <path d="M10 80 L38 32 L50 50 L62 36 L90 80 Z" />
      <path d="M38 32 L46 46 L40 44 L34 50 L30 46 Z M62 36 L70 50 L64 48 L58 52 L56 46 Z" fill="rgba(255,255,255,.55)" />
    </>
  ),
  air: (
    <g fill="none" strokeWidth="7" strokeLinecap="round">
      <path d="M14 38 H58 C68 38 72 30 68 24 C64 18 56 20 56 26" />
      <path d="M14 54 H72 C82 54 86 62 82 68 C78 74 70 72 70 66" />
      <path d="M22 70 H48" />
    </g>
  ),
};

export function Emblem({ c, size = 56, glow = false, portrait }: { c: CharacterDef; size?: number; glow?: boolean; portrait?: string }) {
  const id = useId().replace(/:/g, "");
  // Magic Ludo's four elements have hand-drawn emblems; generated characters use their board glyph.
  const glyph = c.glyph || !PATHS[c.element] ? null : PATHS[c.element];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label={c.name} role="img"
      style={{ filter: glow ? `drop-shadow(0 0 ${size / 6}px ${c.color})` : undefined, flexShrink: 0 }}>
      <defs>
        <radialGradient id={`bg${id}`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor={c.color} stopOpacity=".85" />
          <stop offset="55%" stopColor={c.color} stopOpacity=".35" />
          <stop offset="100%" stopColor="#0b0820" />
        </radialGradient>
        <linearGradient id={`rim${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff7d6" />
          <stop offset="50%" stopColor={c.color} />
          <stop offset="100%" stopColor="#3b0764" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill={`url(#rim${id})`} />
      <circle cx="50" cy="50" r="41" fill={`url(#bg${id})`} />
      <circle cx="50" cy="50" r="41" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1.5" />
      {portrait ? (
        <>
          <clipPath id={`clip${id}`}><circle cx="50" cy="50" r="41" /></clipPath>
          <image href={portrait} x="9" y="9" width="82" height="82" clipPath={`url(#clip${id})`} preserveAspectRatio="xMidYMid slice" />
        </>
      ) : glyph ? (
        <g transform="translate(20 20) scale(.6)" fill="#fffaf0" stroke="#fffaf0">
          {glyph}
        </g>
      ) : (
        <g transform="translate(22 22)">
          <GlyphSvg glyph={c.glyph ?? "gem"} color="#fffaf0" cut={c.color} size={56} />
        </g>
      )}
      <ellipse cx="38" cy="26" rx="16" ry="7" fill="rgba(255,255,255,.18)" />
    </svg>
  );
}
