/**
 * GET /api/azure-token — → { token, region }
 *
 * Mints a short-lived Azure Speech auth token (ARCHITECTURE.md §5.4). The
 * browser runs the Speech SDK with this token; AZURE_SPEECH_KEY itself never
 * ships to the client. Tokens are valid ~10 minutes; we cache in module scope
 * for 8 and refresh lazily (serverless cold starts re-fetch).
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TOKEN_TTL_MS = 8 * 60 * 1000;

let cached: { token: string; fetchedAt: number } | null = null;

export async function GET() {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    return NextResponse.json(
      { error: "AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not configured" },
      { status: 500 },
    );
  }

  if (!cached || Date.now() - cached.fetchedAt > TOKEN_TTL_MS) {
    const res = await fetch(
      `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      { method: "POST", headers: { "Ocp-Apim-Subscription-Key": key } },
    );
    if (!res.ok) {
      console.error("Azure token mint failed:", res.status, await res.text().catch(() => ""));
      return NextResponse.json({ error: "token mint failed" }, { status: 502 });
    }
    cached = { token: await res.text(), fetchedAt: Date.now() };
  }

  return NextResponse.json({ token: cached.token, region });
}
