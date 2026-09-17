import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { fetchAudio } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Streams a log's recording. Blob files are stored privately; this route is
 * the only way the browser reaches them (and the place to add auth checks).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const log = await db.query.logs.findFirst({
    where: eq(schema.logs.id, id),
    columns: { audioUrl: true, audioMime: true },
  });
  if (!log?.audioUrl) return NextResponse.json({ error: "No audio for this log" }, { status: 404 });

  // Local dev files live under /public — just redirect.
  if (log.audioUrl.startsWith("/")) return NextResponse.redirect(new URL(log.audioUrl, _req.url));

  return fetchAudio(log.audioUrl, log.audioMime);
}
