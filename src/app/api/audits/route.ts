import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { AuditInput } from "@/lib/validators";

export const dynamic = "force-dynamic";

const { audits } = schema;

export async function GET() {
  const rows = await db.query.audits.findMany({ with: { field: true }, orderBy: [asc(audits.scheduledFor)] });
  return NextResponse.json({ audits: rows });
}

export async function POST(req: Request) {
  const parsed = AuditInput.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  const farm = await db.query.farms.findFirst();
  if (!farm) return NextResponse.json({ error: "No farm" }, { status: 500 });
  const [row] = await db
    .insert(audits)
    .values({ ...parsed.data, farmId: farm.id, fieldId: parsed.data.fieldId || null })
    .returning();
  return NextResponse.json({ audit: row }, { status: 201 });
}
