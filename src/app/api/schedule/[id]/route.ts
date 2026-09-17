import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { TaskPatch } from "@/lib/validators";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = TaskPatch.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const d = parsed.data;
  const [row] = await db
    .update(schema.scheduleTasks)
    .set({
      ...d,
      fieldId: d.fieldId === undefined ? undefined : d.fieldId || null,
      workerId: d.workerId === undefined ? undefined : d.workerId || null,
    })
    .where(eq(schema.scheduleTasks.id, id))
    .returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ task: row });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await db.delete(schema.scheduleTasks).where(eq(schema.scheduleTasks.id, id));
  return NextResponse.json({ ok: true });
}
