import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { extractLog } from "@/lib/extract";
import { storeAudio } from "@/lib/storage";
import { getLog, listFields, listProducts } from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 60;

const { logs, logApplications, auditEvents, users } = schema;

const BodySchema = z.object({
  transcript: z.string().min(1, "Transcript is empty"),
  language: z.string().default("multi"),
  workerId: z.string().uuid().optional(),
  durationS: z.coerce.number().nonnegative().optional(),
  peaks: z.array(z.number()).optional(),
  /** Browser `getTimezoneOffset()` in minutes, so "06:30" means the worker's 06:30, not the server's. */
  tzOffset: z.coerce.number().default(0),
});

/** "HH:MM" in the worker's local day (given their UTC offset in minutes) → Date */
function localTime(base: Date, hhmm: string | null, tzOffsetMin: number): Date | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  // Shift to the worker's wall clock, set the time, shift back.
  const local = new Date(base.getTime() - tzOffsetMin * 60_000);
  local.setUTCHours(Number(m[1]), Number(m[2]), 0, 0);
  return new Date(local.getTime() + tzOffsetMin * 60_000);
}

export async function POST(req: Request) {
  const form = await req.formData();

  const parsed = BodySchema.safeParse({
    transcript: form.get("transcript"),
    language: form.get("language") ?? undefined,
    workerId: form.get("workerId") || undefined,
    durationS: form.get("durationS") ?? undefined,
    peaks: form.get("peaks") ? JSON.parse(String(form.get("peaks"))) : undefined,
    tzOffset: form.get("tzOffset") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }
  const body = parsed.data;

  const farm = await db.query.farms.findFirst();
  if (!farm) return NextResponse.json({ error: "No farm seeded" }, { status: 500 });

  // Worker: explicit, else the first worker (demo default).
  const worker = body.workerId
    ? await db.query.users.findFirst({ where: eq(users.id, body.workerId) })
    : await db.query.users.findFirst({ where: eq(users.role, "worker") });

  // 1. Audio → storage (optional; transcript-only submissions are allowed).
  let audioUrl: string | null = null;
  let audioMime: string | null = null;
  const audio = form.get("audio");
  if (audio instanceof Blob && audio.size > 0) {
    audioMime = audio.type || "audio/webm";
    audioUrl = await storeAudio(Buffer.from(await audio.arrayBuffer()), audioMime);
    if (!audioUrl) audioMime = null;
  }

  // 2. Transcript → structured record.
  const recordedAt = new Date();
  const [fields, products] = await Promise.all([listFields(), listProducts()]);
  const { extraction, via } = await extractLog({
    transcript: body.transcript,
    languageHint: body.language,
    recordedAt,
    workerName: worker?.name ?? "Unknown",
    fields,
    products,
  });

  const field = extraction.field_code
    ? fields.find((f) => f.code.toLowerCase() === extraction.field_code!.toLowerCase()) ?? null
    : null;

  // 3. Persist.
  const [log] = await db
    .insert(logs)
    .values({
      farmId: farm.id,
      workerId: worker?.id ?? null,
      fieldId: field?.id ?? null,
      activityType: extraction.activity_type,
      status: extraction.needs_review ? "flagged" : "new",
      source: "online",
      startedAt:
        localTime(recordedAt, extraction.started_at_local, body.tzOffset) ??
        new Date(recordedAt.getTime() - (body.durationS ?? 0) * 1000),
      endedAt: localTime(recordedAt, extraction.ended_at_local, body.tzOffset) ?? recordedAt,
      languageDetected: extraction.language_detected,
      transcriptRaw: body.transcript,
      transcriptEn: extraction.transcript_en,
      summary: extraction.summary_en,
      audioUrl,
      audioMime,
      durationS: body.durationS?.toFixed(2) ?? null,
      peaks: body.peaks ?? null,
      confidence: extraction.confidence.toFixed(2),
      needsReview: extraction.needs_review,
      reviewReason: extraction.review_reason,
      extraction: { ...extraction, via },
      createdAt: recordedAt,
      syncedAt: recordedAt,
    })
    .returning();

  if (extraction.products.length) {
    await db.insert(logApplications).values(
      extraction.products.map((p) => {
        const match = products.find(
          (kp) =>
            kp.name.toLowerCase() === p.name.toLowerCase() ||
            kp.aliases.some((a) => a.toLowerCase() === p.name.toLowerCase()),
        );
        return {
          logId: log.id,
          productId: match?.id ?? null,
          productName: match?.name ?? p.name,
          rate: p.rate?.toString() ?? null,
          unit: p.unit,
        };
      }),
    );
  }

  await db.insert(auditEvents).values({
    logId: log.id,
    userId: worker?.id ?? null,
    action: "created",
    diff: { source: "online", language: body.language, extraction_via: via },
  });

  const detail = await getLog(log.id);
  return NextResponse.json({ log: detail, via }, { status: 201 });
}
