import { NextResponse } from "next/server";
import { DeepgramClient } from "@deepgram/sdk";
import { listProducts, listFields } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mints a short-lived Deepgram access token for the browser so the real API
 * key never leaves the server. Also returns the farm's keyterm vocabulary
 * (product names + field codes) so Nova-3 is biased toward agri terms.
 */
export async function GET() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "DEEPGRAM_API_KEY is not configured on the server." },
      { status: 503 },
    );
  }

  try {
    const dg = new DeepgramClient({ apiKey });
    const [grant, products, fields] = await Promise.all([
      dg.auth.v1.tokens.grant({ ttl_seconds: 60 }),
      listProducts(),
      listFields(),
    ]);

    const keyterms = new Set<string>();
    for (const p of products) {
      keyterms.add(p.name);
      if (p.activeIngredient) keyterms.add(p.activeIngredient);
      for (const a of p.aliases) keyterms.add(a);
    }
    for (const f of fields) {
      keyterms.add(f.code);
      keyterms.add(f.name);
    }

    return NextResponse.json({
      accessToken: grant.access_token,
      expiresIn: grant.expires_in ?? 60,
      keyterms: [...keyterms].slice(0, 100), // Deepgram caps keyterms per request
    });
  } catch (err) {
    console.error("deepgram token error", err);
    return NextResponse.json({ error: "Could not mint Deepgram token." }, { status: 502 });
  }
}
