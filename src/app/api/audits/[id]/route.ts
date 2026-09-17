import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { AuditPatch } from "@/lib/validators";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = AuditPatch.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const [row] = await db
    .update(schema.audits)
    .set({ ...parsed.data, fieldId: parsed.data.fieldId === undefined ? undefined : parsed.data.fieldId || null })
    .where(eq(schema.audits.id, id))
    .returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ audit: row });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await db.delete(schema.audits).where(eq(schema.audits.id, id));
  return NextResponse.json({ ok: true });
}
