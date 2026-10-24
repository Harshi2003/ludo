import type { ThemePack } from "@ludo/engine";

const FAL_URL = "https://fal.run/fal-ai/flux/schnell";

async function paint(prompt: string, size: "landscape_16_9" | "square_hd"): Promise<string | undefined> {
  try {
    const res = await fetch(FAL_URL, {
      method: "POST",
      headers: { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, image_size: size, num_images: 1, enable_safety_checker: true }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { images?: { url: string }[] };
    return data.images?.[0]?.url;
  } catch {
    return undefined;
  }
}

/** Background and character portraits; any failure just leaves the code-drawn art in place. */
export async function paintWorld(pack: ThemePack) {
  const style = pack.art.style;
  const [background, ...portraits] = await Promise.all([
    paint(`${style}. Wide panoramic fantasy landscape of ${pack.world.name}: ${pack.zones.map((z) => z.name).join(", ")}, leading to ${pack.world.finish}. Dark night sky, no text, no people, game background art`, "landscape_16_9"),
    ...pack.characters.map((c) =>
      paint(`${style}. Heroic portrait of ${c.name}, ${c.title}. ${c.bio} Centered bust, glowing ${c.color} rim light, dark background, no text, game character art`, "square_hd")),
  ]);
  return {
    background,
    portraits: Object.fromEntries(pack.characters.flatMap((c, i) => (portraits[i] ? [[c.id, portraits[i]!]] : []))),
  };
}
