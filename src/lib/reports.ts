import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Product, Report, ReportType } from "@/db/schema";

const { logs, users, fields } = schema;

/**
 * Report presets. Keywords are matched (case-insensitive substring) against the
 * transcript, its English translation, the summary, the activity type and the
 * product names on each log. Product/alias names from the farm's own catalog
 * are appended at creation time so brand names the crew actually says match.
 */
export const REPORT_PRESETS: Record<ReportType, { title: string; description: string; keywords: string[]; productTypes: Product["type"][] }> = {
  pesticide_use: {
    title: "Pesticide use report",
    description: "Every spray application — herbicides, insecticides, fungicides — with product, rate and field. What the county ag commissioner asks for.",
    keywords: ["spray", "sprayed", "spraying", "herbicide", "insecticide", "fungicide", "pesticide", "oz/ac", "qt/ac", "gal/ac"],
    productTypes: ["herbicide", "insecticide", "fungicide"],
  },
  fertilizer: {
    title: "Fertilizer applications",
    description: "Nutrient applications — urea, anhydrous, nitrogen, spreading — for nutrient-management plans.",
    keywords: ["fertiliz", "fertilizer", "urea", "anhydrous", "ammonia", "nitrogen", "spread", "lb/ac", "kg/ha"],
    productTypes: ["fertilizer"],
  },
  field_activity: {
    title: "Field activity log",
    description: "Everything that happened on one field in a date range. Pick the field below.",
    keywords: [],
    productTypes: [],
  },
  custom: {
    title: "Custom report",
    description: "Your own keywords — e.g. “aphid”, “leak”, “tower four”, “wet”.",
    keywords: [],
    productTypes: [],
  },
};

/** Preset keywords + the farm's matching product names/aliases. */
export function keywordsForPreset(type: ReportType, products: Product[], extra: string[] = []) {
  const preset = REPORT_PRESETS[type];
  const set = new Set<string>(preset.keywords.map((k) => k.toLowerCase()));
  for (const p of products) {
    if (!preset.productTypes.includes(p.type)) continue;
    set.add(p.name.toLowerCase());
    if (p.activeIngredient) set.add(p.activeIngredient.toLowerCase());
    for (const a of p.aliases) set.add(a.toLowerCase());
  }
  for (const k of extra) if (k.trim()) set.add(k.trim().toLowerCase());
  return [...set];
}

export type ReportMatch = {
  id: string;
  createdAt: Date;
  workerName: string;
  fieldCode: string;
  activityType: string;
  summary: string | null;
  transcript: string;
  products: string;
  confidence: number | null;
  matched: string[];
};

/** Run a saved report: the logs it matches, newest first, with the keywords that hit. */
export async function runReport(report: Report): Promise<ReportMatch[]> {
  const conds: SQL[] = [eq(logs.farmId, report.farmId)];
  if (report.fieldId) conds.push(eq(logs.fieldId, report.fieldId));
  if (report.fromDate) conds.push(gte(logs.createdAt, report.fromDate));
  if (report.toDate) conds.push(lte(logs.createdAt, report.toDate));

  // "32.000 oz/ac" → "32 oz/ac"
  const productsAgg = sql<string>`coalesce((select string_agg(la.product_name || coalesce(' @ ' || rtrim(rtrim(la.rate::text, '0'), '.') || ' ' || coalesce(la.unit, ''), ''), ', ') from log_applications la where la.log_id = ${logs.id}), '')`;

  if (report.keywords.length) {
    const kw = report.keywords.map((k) => {
      const like = `%${k}%`;
      return or(
        ilike(logs.transcriptRaw, like),
        ilike(logs.transcriptEn, like),
        ilike(logs.summary, like),
        sql`${logs.activityType}::text ilike ${like}`,
        sql`exists (select 1 from log_applications la where la.log_id = ${logs.id} and la.product_name ilike ${like})`,
      )!;
    });
    conds.push(or(...kw)!);
  }

  const rows = await db
    .select({
      id: logs.id,
      createdAt: logs.createdAt,
      workerName: sql<string>`coalesce(${users.name}, 'Unknown')`,
      fieldCode: sql<string>`coalesce(${fields.code}, '—')`,
      activityType: logs.activityType,
      summary: logs.summary,
      transcriptRaw: logs.transcriptRaw,
      transcriptEn: logs.transcriptEn,
      products: productsAgg,
      confidence: logs.confidence,
    })
    .from(logs)
    .leftJoin(users, eq(logs.workerId, users.id))
    .leftJoin(fields, eq(logs.fieldId, fields.id))
    .where(and(...conds))
    .orderBy(desc(logs.createdAt))
    .limit(500);

  return rows.map((r) => {
    const hay = [r.transcriptRaw, r.transcriptEn, r.summary, r.activityType, r.products].filter(Boolean).join(" \n ").toLowerCase();
    const matched = report.keywords.filter((k) => hay.includes(k.toLowerCase()));
    return {
      id: r.id,
      createdAt: r.createdAt,
      workerName: r.workerName,
      fieldCode: r.fieldCode,
      activityType: r.activityType,
      summary: r.summary,
      transcript: r.transcriptEn ?? r.transcriptRaw,
      products: r.products,
      confidence: r.confidence == null ? null : Number(r.confidence),
      matched,
    };
  });
}
