import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { activityType } from "@/db/schema";
import { getAdmin, getLog } from "@/lib/queries";

export const dynamic = "force-dynamic";

const { logs, auditEvents, logTags, tags } = schema;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const log = await getLog(id);
  if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ log });
}

const PatchSchema = z.object({
  fieldId: z.string().uuid().nullable().optional(),
  activityType: z.enum(activityType.enumValues).optional(),
  status: z.enum(["new", "reviewed", "flagged"]).optional(),
  summary: z.string().optional(),
  addTag: z.string().min(1).max(40).optional(),
  removeTagId: z.string().uuid().optional(),
});

/**
 * Admin edits to a log. Every change writes an audit_events row with the
 * before/after diff — this is the compliance trail.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = PatchSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const before = await getLog(id);
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = await getAdmin();
  const p = body.data;

  const patch: Partial<typeof logs.$inferInsert> = {};
  const diff: Record<string, { from: unknown; to: unknown }> = {};

  if (p.fieldId !== undefined && p.fieldId !== before.fieldId) {
    patch.fieldId = p.fieldId;
    diff.field = { from: before.fieldCode, to: p.fieldId };
  }
  if (p.activityType && p.activityType !== before.activityType) {
    patch.activityType = p.activityType;
    diff.activity = { from: before.activityType, to: p.activityType };
  }
  if (p.summary !== undefined && p.summary !== before.summary) {
    patch.summary = p.summary;
    diff.summary = { from: before.summary, to: p.summary };
  }
  if (p.status && p.status !== before.status) {
    patch.status = p.status;
    diff.status = { from: before.status, to: p.status };
    if (p.status === "reviewed") {
      patch.needsReview = false;
      patch.reviewReason = null;
    }
  }
  // Editing a flagged log's field/activity implies the admin reviewed it.
  if ((patch.fieldId !== undefined || patch.activityType) && before.needsReview && !p.status) {
    patch.status = "reviewed";
    patch.needsReview = false;
    patch.reviewReason = null;
    diff.status = { from: before.status, to: "reviewed" };
  }

  if (Object.keys(patch).length) {
    await db.update(logs).set(patch).where(eq(logs.id, id));
    await db.insert(auditEvents).values({
      logId: id,
      userId: admin?.id ?? null,
      action: patch.status === "reviewed" && Object.keys(diff).length === 1 ? "reviewed" : "edited",
      diff,
    });
  }

  if (p.addTag) {
    const raw = (await db.query.logs.findFirst({ where: eq(logs.id, id), columns: { farmId: true } }))!;
    let tag = await db.query.tags.findFirst({ where: and(eq(tags.farmId, raw.farmId), eq(tags.name, p.addTag)) });
    if (!tag) {
      [tag] = await db.insert(tags).values({ farmId: raw.farmId, name: p.addTag }).returning();
    }
    await db.insert(logTags).values({ logId: id, tagId: tag.id }).onConflictDoNothing();
    await db.insert(auditEvents).values({ logId: id, userId: admin?.id ?? null, action: "tag_added", diff: { tag: tag.name } });
  }

  if (p.removeTagId) {
    await db.delete(logTags).where(and(eq(logTags.logId, id), eq(logTags.tagId, p.removeTagId)));
    await db.insert(auditEvents).values({ logId: id, userId: admin?.id ?? null, action: "tag_removed", diff: { tagId: p.removeTagId } });
  }

  const after = await getLog(id);
  return NextResponse.json({ log: after });
}
