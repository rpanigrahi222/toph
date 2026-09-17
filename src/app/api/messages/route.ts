import { NextResponse } from "next/server";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { translateMessage } from "@/lib/translate";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const { messages, users } = schema;

export async function GET(req: Request) {
  const workerId = new URL(req.url).searchParams.get("worker");
  if (!workerId) return NextResponse.json({ error: "worker is required" }, { status: 400 });
  const rows = await db.select().from(messages).where(eq(messages.workerId, workerId)).orderBy(asc(messages.createdAt));
  return NextResponse.json({ messages: rows });
}

const PostSchema = z.object({
  workerId: z.string().uuid(),
  body: z.string().min(1).max(2000),
  /** Who is writing. "worker" lets the demo show the reverse direction. */
  sender: z.enum(["admin", "worker"]).default("admin"),
  /** Language the body is written in. Admin defaults to English; worker to their preferred language. */
  language: z.string().optional(),
  logId: z.string().uuid().optional(),
});

/**
 * Send a message. Admin → worker is translated into the worker's preferred
 * language; worker → admin is translated into English. Both versions are stored.
 */
export async function POST(req: Request) {
  const parsed = PostSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { workerId, body, sender, logId } = parsed.data;

  const worker = await db.query.users.findFirst({ where: eq(users.id, workerId) });
  if (!worker) return NextResponse.json({ error: "Worker not found" }, { status: 404 });

  const sourceLang = parsed.data.language ?? (sender === "admin" ? "en" : worker.preferredLanguage);
  const targetLang = sender === "admin" ? worker.preferredLanguage : "en";

  const t =
    sourceLang === targetLang
      ? { source_language: sourceLang, translation: body, via: "none" as const }
      : await translateMessage(body, targetLang, sourceLang);

  const [row] = await db
    .insert(messages)
    .values({
      farmId: worker.farmId,
      workerId,
      sender,
      bodyOriginal: body,
      languageOriginal: t.source_language,
      bodyTranslated: t.translation,
      languageTranslated: targetLang,
      logId: logId ?? null,
    })
    .returning();

  return NextResponse.json({ message: row, via: t.via }, { status: 201 });
}
