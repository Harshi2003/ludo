import { connection } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ART_DIR } from "@/lib/ai/art";

const SAFE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const FILE = /^[a-z0-9-]{1,100}\.(jpg|png)$/;

/** GET /api/art/<pack>/<file> → a painted image saved at forge time. */
export async function GET(_req: Request, ctx: { params: Promise<{ pack: string; file: string }> }) {
  await connection();
  const { pack, file } = await ctx.params;
  if (!SAFE.test(pack) || !FILE.test(file)) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(path.join(ART_DIR, pack, file));
    return new Response(bytes, {
      headers: { "Content-Type": file.endsWith(".png") ? "image/png" : "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
