import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { keywordsForPreset } from "@/lib/reports";
import { listProducts } from "@/lib/queries";
import { ReportInput } from "@/lib/validators";

export const dynamic = "force-dynamic";

const { reports } = schema;

export async function GET() {
  const rows = await db.query.reports.findMany({ with: { field: true }, orderBy: [desc(reports.createdAt)] });
  return NextResponse.json({ reports: rows });
}

export async function POST(req: Request) {
  const parsed = ReportInput.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  const farm = await db.query.farms.findFirst();
  if (!farm) return NextResponse.json({ error: "No farm" }, { status: 500 });
  const products = await listProducts();
  const d = parsed.data;
  const [row] = await db
    .insert(reports)
    .values({
      farmId: farm.id,
      title: d.title,
      type: d.type,
      keywords: keywordsForPreset(d.type, products, d.keywords),
      fieldId: d.fieldId || null,
      fromDate: d.fromDate ?? null,
      toDate: d.toDate ?? null,
      notes: d.notes ?? null,
    })
    .returning();
  return NextResponse.json({ report: row }, { status: 201 });
}
