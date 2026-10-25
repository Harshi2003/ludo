import type { ThemePack } from "@ludo/engine";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { STUDIO, bitdeerImage } from "./bitdeer";

const FAL_URL = "https://fal.run/fal-ai/flux/schnell";

/** Painted art is copied here, since both providers hand back links that expire. */
export const ART_DIR = process.env.ART_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "art");

type Shape = "wide" | "square";

async function fal(prompt: string, shape: Shape): Promise<string | undefined> {
  if (!process.env.FAL_KEY) return undefined;
  try {
    const res = await fetch(FAL_URL, {
      method: "POST",
      headers: { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, image_size: shape === "wide" ? "landscape_16_9" : "square_hd", num_images: 1, enable_safety_checker: true }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { images?: { url: string }[] };
    return data.images?.[0]?.url;
  } catch {
    return undefined;
  }
}

/** Downloads a painted image into ART_DIR and returns the path the app serves it from. */
async function keep(url: string, packId: string, name: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return undefined;
    const ext = (res.headers.get("content-type") ?? "").includes("png") ? "png" : "jpg";
    await mkdir(path.join(ART_DIR, packId), { recursive: true });
    await writeFile(path.join(ART_DIR, packId, `${name}.${ext}`), Buffer.from(await res.arrayBuffer()));
    return `/api/art/${packId}/${name}.${ext}`;
  } catch {
    return undefined;
  }
}

/** Seedream on Bitdeer first, fal per image if it fails. */
async function paint(prompt: string, shape: Shape, packId: string, name: string): Promise<{ url: string; by: string } | undefined> {
  if (process.env.BITDEER_API_KEY) {
    try {
      const url = await keep(await bitdeerImage(prompt, { size: shape === "wide" ? "2560x1440" : undefined }), packId, name);
      if (url) return { url, by: STUDIO.art };
    } catch (err) {
      console.warn(`[art] seedream failed for ${name}:`, (err as Error).message);
    }
  }
  const f = await fal(prompt, shape);
  const url = f && (await keep(f, packId, name));
  return url ? { url, by: "fal flux" } : undefined;
}

export const canPaint = () => !!(process.env.BITDEER_API_KEY || process.env.FAL_KEY);

/** Background and character portraits; any failure just leaves the code-drawn art in place. */
export async function paintWorld(pack: ThemePack) {
  const style = pack.art.style;
  const [background, ...portraits] = await Promise.all([
    paint(`${style}. Wide panoramic fantasy landscape of ${pack.world.name}: ${pack.zones.map((z) => z.name).join(", ")}, leading to ${pack.world.finish}. Dark night sky, no text, no people, game background art`, "wide", pack.id, "background"),
    ...pack.characters.map((c) =>
      paint(`${style}. Heroic portrait of ${c.name}, ${c.title}. ${c.bio} Centered bust, glowing ${c.color} rim light, dark background, no text, game character art`, "square", pack.id, `portrait-${c.id}`)),
  ]);
  const painted = [background, ...portraits].filter((x) => x !== undefined);
  return {
    background: background?.url,
    portraits: Object.fromEntries(pack.characters.flatMap((c, i) => (portraits[i] ? [[c.id, portraits[i]!.url]] : []))),
    /** Who painted what, e.g. "seedream-5.0-lite ×5". */
    by: [...new Set(painted.map((p) => p.by))].map((by) => `${by} ×${painted.filter((p) => p.by === by).length}`).join(", "),
  };
}
