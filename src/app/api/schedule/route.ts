import { NextResponse } from "next/server";
import { and, asc, gte, lte, sql } from "drizzle-orm";
import { endOfMonth, startOfMonth, subDays, addDays, parse } from "date-fns";
import { db, schema } from "@/db";
import { TaskInput } from "@/lib/validators";

export const dynamic = "force-dynamic";

const { scheduleTasks, logs } = schema;

/** GET /api/schedule?month=2026-09 — tasks for that month (± a week for the grid edges). */
export async function GET(req: Request) {
  const m = new URL(req.url).searchParams.get("month");
  const base = m ? parse(m, "yyyy-MM", new Date()) : new Date();
  const from = subDays(startOfMonth(base), 7);
  const to = addDays(endOfMonth(base), 7);
  const [rows, logDays] = await Promise.all([
    db.query.scheduleTasks.findMany({
      where: and(gte(scheduleTasks.startsAt, from), lte(scheduleTasks.startsAt, to)),
      with: { field: true, worker: true },
      orderBy: [asc(scheduleTasks.startsAt)],
    }),
    // Actual work per day (from voice logs), so the calendar shows planned vs done.
    db
      .select({ day: sql<string>`to_char(${logs.createdAt}, 'YYYY-MM-DD')`, n: sql<number>`count(*)` })
      .from(logs)
      .where(and(gte(logs.createdAt, from), lte(logs.createdAt, to)))
      .groupBy(sql`to_char(${logs.createdAt}, 'YYYY-MM-DD')`),
  ]);
  const logsByDay = Object.fromEntries(logDays.map((d) => [d.day, Number(d.n)]));
  return NextResponse.json({ tasks: rows, logsByDay });
}

export async function POST(req: Request) {
  const parsed = TaskInput.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  const farm = await db.query.farms.findFirst();
  if (!farm) return NextResponse.json({ error: "No farm" }, { status: 500 });
  const d = parsed.data;
  const [row] = await db
    .insert(scheduleTasks)
    .values({ ...d, farmId: farm.id, fieldId: d.fieldId || null, workerId: d.workerId || null, endsAt: d.endsAt ?? null })
    .returning();
  return NextResponse.json({ task: row }, { status: 201 });
}
