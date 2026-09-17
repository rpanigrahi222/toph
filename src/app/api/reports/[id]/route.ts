import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { runReport } from "@/lib/reports";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const report = await db.query.reports.findFirst({ where: eq(schema.reports.id, id), with: { field: true } });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const matches = await runReport(report);
  return NextResponse.json({ report, matches });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await db.delete(schema.reports).where(eq(schema.reports.id, id));
  return NextResponse.json({ ok: true });
}
