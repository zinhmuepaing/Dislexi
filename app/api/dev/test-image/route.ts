/**
 * DEV-ONLY fixture server for the static-image test path (BACKLOG_PROGRESS B0).
 *
 * Serves the sample worksheet photos in `test_folder/` so CameraStage can draw
 * a fixture instead of a live camera, letting every camera-dependent feature be
 * verified without a phone. The images stay OUT of `public/` deliberately: they
 * are ~800 KB of test data that must never ship to production or be publicly
 * reachable.
 *
 * Hard-disabled when NODE_ENV === "production" — the route 404s there even if
 * the client flag is somehow set.
 *
 *   GET /api/dev/test-image            → { images: [name, …] }
 *   GET /api/dev/test-image?name=<f>   → the image bytes
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const FIXTURE_DIR = path.join(process.cwd(), "test_folder");
const ALLOWED = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const disabled = () => process.env.NODE_ENV === "production";

async function fixtureNames(): Promise<string[]> {
  const entries = await readdir(FIXTURE_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && ALLOWED.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort();
}

export async function GET(req: NextRequest) {
  if (disabled()) return new NextResponse("Not found", { status: 404 });

  const name = req.nextUrl.searchParams.get("name");

  try {
    if (!name) return NextResponse.json({ images: await fixtureNames() });

    // Validate against the real listing rather than sanitising the string —
    // a name that isn't an actual fixture never reaches the filesystem, so
    // path traversal has nothing to traverse.
    const names = await fixtureNames();
    if (!names.includes(name)) return new NextResponse("Not found", { status: 404 });

    const bytes = await readFile(path.join(FIXTURE_DIR, name));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": MIME[path.extname(name).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("test-image fixture read failed:", err);
    return NextResponse.json({ images: [], error: "test_folder unreadable" }, { status: 500 });
  }
}
