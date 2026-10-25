import { connection } from "next/server";
import { validatePack } from "@ludo/themepack";
import { listStoredWorlds, removeStoredWorld, storeWorld } from "@/lib/worldStore";

/** GET → every saved AI world. */
export async function GET() {
  await connection();
  return Response.json({ worlds: await listStoredWorlds() });
}

/** POST { pack, prompt? } → save (or overwrite) a world, e.g. after renaming it in the editor. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { pack?: unknown; prompt?: unknown; createdAt?: unknown };
  const v = validatePack(body.pack);
  if (!v.ok) return Response.json({ error: v.errors.slice(0, 3).join("; ") }, { status: 400 });
  try {
    await storeWorld({
      pack: v.pack,
      prompt: typeof body.prompt === "string" ? body.prompt.slice(0, 500) : undefined,
      createdAt: typeof body.createdAt === "number" ? body.createdAt : Date.now(),
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
  return Response.json({ ok: true });
}

/** DELETE ?id=… → remove a saved world. */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  try {
    await removeStoredWorld(id);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
  return Response.json({ ok: true });
}
