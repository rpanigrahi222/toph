import { and, asc, count, countDistinct, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { endOfMonth, startOfDay, startOfMonth, subDays } from "date-fns";
import { db, schema } from "@/db";
import { playbackUrl } from "@/lib/storage";
import type { ActivityType, LogStatus } from "@/db/schema";

const { logs, users, fields, logApplications, tags, auditEvents, products } = schema;

// ---------------------------------------------------------------------------
// Filters (mirrors the URL search params on the dashboard)
// ---------------------------------------------------------------------------

export type LogSort = "date_desc" | "date_asc" | "employee" | "confidence";

export type LogFilters = {
  status?: LogStatus | "all";
  thisMonth?: boolean;
  from?: Date;
  to?: Date;
  q?: string;
  fieldId?: string;
  workerId?: string;
  activity?: ActivityType;
  sort?: LogSort;
  limit?: number;
};

export type LogRow = {
  id: string;
  workerId: string | null;
  workerName: string;
  fieldId: string | null;
  fieldCode: string;
  fieldName: string;
  activityType: ActivityType;
  status: LogStatus;
  source: "online" | "offline";
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  languageDetected: string | null;
  confidence: number | null;
  needsReview: boolean;
  summary: string | null;
};

export type LogDetail = LogRow & {
  transcriptRaw: string;
  transcriptEn: string | null;
  reviewReason: string | null;
  audioUrl: string | null;
  audioMime: string | null;
  durationS: number | null;
  peaks: number[] | null;
  syncedAt: Date | null;
  extraction: Record<string, unknown> | null;
  field: { code: string; name: string; geometry: GeoJSON.Polygon; centroidLat: number; centroidLng: number } | null;
  applications: { id: string; productName: string; rate: string | null; unit: string | null; reiHours: number | null }[];
  tags: { id: string; name: string; color: string }[];
  audit: { id: string; action: string; userName: string | null; diff: Record<string, unknown> | null; createdAt: Date }[];
};

function whereFor(f: LogFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (f.status && f.status !== "all") {
    conds.push(f.status === "new" ? inArray(logs.status, ["new", "flagged"]) : eq(logs.status, f.status));
  }
  if (f.thisMonth) {
    const now = new Date();
    conds.push(gte(logs.createdAt, startOfMonth(now)));
    conds.push(lte(logs.createdAt, endOfMonth(now)));
  }
  if (f.from) conds.push(gte(logs.createdAt, f.from));
  if (f.to) conds.push(lte(logs.createdAt, f.to));
  if (f.fieldId) conds.push(eq(logs.fieldId, f.fieldId));
  if (f.workerId) conds.push(eq(logs.workerId, f.workerId));
  if (f.activity) conds.push(eq(logs.activityType, f.activity));
  if (f.q?.trim()) {
    const like = `%${f.q.trim()}%`;
    conds.push(
      or(
        ilike(users.name, like),
        ilike(fields.code, like),
        ilike(fields.name, like),
        ilike(logs.transcriptRaw, like),
        ilike(logs.transcriptEn, like),
        ilike(logs.summary, like),
        sql`${logs.activityType}::text ilike ${like}`,
      )!,
    );
  }
  return conds.length ? and(...conds) : undefined;
}

function orderFor(sort: LogSort | undefined) {
  switch (sort) {
    case "date_asc":
      return [asc(logs.createdAt)];
    case "employee":
      return [asc(users.name), desc(logs.createdAt)];
    case "confidence":
      return [asc(logs.confidence), desc(logs.createdAt)];
    default:
      return [desc(logs.createdAt)];
  }
}

export async function listLogs(f: LogFilters = {}): Promise<{ rows: LogRow[]; total: number }> {
  const where = whereFor(f);
  const rows = await db
    .select({
      id: logs.id,
      workerId: logs.workerId,
      workerName: sql<string>`coalesce(${users.name}, 'Unknown')`,
      fieldId: logs.fieldId,
      fieldCode: sql<string>`coalesce(${fields.code}, '—')`,
      fieldName: sql<string>`coalesce(${fields.name}, '')`,
      activityType: logs.activityType,
      status: logs.status,
      source: logs.source,
      startedAt: logs.startedAt,
      endedAt: logs.endedAt,
      createdAt: logs.createdAt,
      languageDetected: logs.languageDetected,
      confidence: logs.confidence,
      needsReview: logs.needsReview,
      summary: logs.summary,
    })
    .from(logs)
    .leftJoin(users, eq(logs.workerId, users.id))
    .leftJoin(fields, eq(logs.fieldId, fields.id))
    .where(where)
    .orderBy(...orderFor(f.sort))
    .limit(f.limit ?? 200);

  const [{ total }] = await db
    .select({ total: count() })
    .from(logs)
    .leftJoin(users, eq(logs.workerId, users.id))
    .leftJoin(fields, eq(logs.fieldId, fields.id))
    .where(where);

  return {
    rows: rows.map((r) => ({ ...r, confidence: r.confidence == null ? null : Number(r.confidence) })),
    total,
  };
}

export async function getLog(id: string): Promise<LogDetail | null> {
  const log = await db.query.logs.findFirst({
    where: eq(logs.id, id),
    with: {
      worker: true,
      field: true,
      applications: { with: { product: true } },
      logTags: { with: { tag: true } },
      auditEvents: { with: { user: true }, orderBy: [desc(auditEvents.createdAt)] },
    },
  });
  if (!log) return null;
  return {
    id: log.id,
    workerId: log.workerId,
    workerName: log.worker?.name ?? "Unknown",
    fieldId: log.fieldId,
    fieldCode: log.field?.code ?? "—",
    fieldName: log.field?.name ?? "",
    activityType: log.activityType,
    status: log.status,
    source: log.source,
    startedAt: log.startedAt,
    endedAt: log.endedAt,
    createdAt: log.createdAt,
    languageDetected: log.languageDetected,
    confidence: log.confidence == null ? null : Number(log.confidence),
    needsReview: log.needsReview,
    summary: log.summary,
    transcriptRaw: log.transcriptRaw,
    transcriptEn: log.transcriptEn,
    reviewReason: log.reviewReason,
    audioUrl: playbackUrl(log.id, log.audioUrl),
    audioMime: log.audioMime,
    durationS: log.durationS == null ? null : Number(log.durationS),
    peaks: log.peaks,
    syncedAt: log.syncedAt,
    extraction: log.extraction,
    field: log.field
      ? {
          code: log.field.code,
          name: log.field.name,
          geometry: log.field.geometry,
          centroidLat: Number(log.field.centroidLat),
          centroidLng: Number(log.field.centroidLng),
        }
      : null,
    applications: log.applications.map((a) => ({
      id: a.id,
      productName: a.productName,
      rate: a.rate,
      unit: a.unit,
      reiHours: a.product?.reiHours ?? null,
    })),
    tags: log.logTags.map((lt) => ({ id: lt.tag.id, name: lt.tag.name, color: lt.tag.color })),
    audit: log.auditEvents.map((e) => ({
      id: e.id,
      action: e.action,
      userName: e.user?.name ?? null,
      diff: e.diff,
      createdAt: e.createdAt,
    })),
  };
}

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------

export type DashboardStats = {
  todayRecordings: number;
  todayNew: number;
  activeWorkers: number;
  totalWorkers: number;
  responseAccuracy: number; // 0..100
  needsReview: number;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const today = startOfDay(new Date());
  const weekAgo = subDays(new Date(), 7);

  const [todayRow] = await db
    .select({
      total: count(),
      fresh: sql<number>`count(*) filter (where ${logs.status} in ('new','flagged'))`,
    })
    .from(logs)
    .where(gte(logs.createdAt, today));

  const [activeRow] = await db
    .select({ active: countDistinct(logs.workerId) })
    .from(logs)
    .where(gte(logs.createdAt, weekAgo));

  const [workersRow] = await db.select({ total: count() }).from(users).where(eq(users.role, "worker"));

  // "Response accuracy": average extraction confidence over the last 30 days.
  const [accRow] = await db
    .select({ avg: sql<number>`coalesce(avg(${logs.confidence}), 0)` })
    .from(logs)
    .where(gte(logs.createdAt, subDays(new Date(), 30)));

  const [reviewRow] = await db.select({ n: count() }).from(logs).where(eq(logs.needsReview, true));

  return {
    todayRecordings: Number(todayRow.total),
    todayNew: Number(todayRow.fresh),
    activeWorkers: Number(activeRow.active),
    totalWorkers: Number(workersRow.total),
    responseAccuracy: Math.round(Number(accRow.avg) * 100),
    needsReview: Number(reviewRow.n),
  };
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export async function listFields() {
  return db.select().from(fields).orderBy(asc(fields.code));
}

export async function listWorkers() {
  return db.select().from(users).where(eq(users.role, "worker")).orderBy(asc(users.name));
}

export async function listTags() {
  return db.select().from(tags).orderBy(asc(tags.name));
}

export async function listProducts() {
  return db.select().from(products).orderBy(asc(products.name));
}

export async function getAdmin() {
  return db.query.users.findFirst({ where: eq(users.role, "admin") });
}

/**
 * For the Map page: each field with its most recent spray application and
 * the computed restricted-entry-interval expiry.
 */
export async function listFieldsWithRei() {
  const allFields = await listFields();
  const recentSprays = await db
    .select({
      fieldId: logs.fieldId,
      endedAt: logs.endedAt,
      createdAt: logs.createdAt,
      productName: logApplications.productName,
      reiHours: products.reiHours,
      workerName: users.name,
      activityType: logs.activityType,
    })
    .from(logs)
    .innerJoin(logApplications, eq(logApplications.logId, logs.id))
    .leftJoin(products, eq(logApplications.productId, products.id))
    .leftJoin(users, eq(logs.workerId, users.id))
    .where(and(eq(logs.activityType, "spraying"), gte(logs.createdAt, subDays(new Date(), 7))))
    .orderBy(desc(logs.createdAt));

  return allFields.map((f) => {
    const spray = recentSprays.find((s) => s.fieldId === f.id);
    const appliedAt = spray?.endedAt ?? spray?.createdAt ?? null;
    const reiExpires =
      spray && appliedAt && spray.reiHours ? new Date(appliedAt.getTime() + spray.reiHours * 3600_000) : null;
    return {
      ...f,
      centroidLat: Number(f.centroidLat),
      centroidLng: Number(f.centroidLng),
      lastSpray: spray
        ? { productName: spray.productName, appliedAt, reiHours: spray.reiHours, workerName: spray.workerName }
        : null,
      reiExpires,
      reiActive: reiExpires ? reiExpires > new Date() : false,
    };
  });
}

export type FieldWithRei = Awaited<ReturnType<typeof listFieldsWithRei>>[number];

// ---------------------------------------------------------------------------
// Performance page
// ---------------------------------------------------------------------------

export async function workerPerformance() {
  const since = subDays(new Date(), 30);
  const rows = await db
    .select({
      workerId: users.id,
      name: users.name,
      language: users.preferredLanguage,
      logCount: count(logs.id),
      avgConfidence: sql<number>`coalesce(avg(${logs.confidence}), 0)`,
      flagged: sql<number>`count(*) filter (where ${logs.needsReview})`,
      lastLog: sql<Date | null>`max(${logs.createdAt})`,
    })
    .from(users)
    .leftJoin(logs, and(eq(logs.workerId, users.id), gte(logs.createdAt, since)))
    .where(eq(users.role, "worker"))
    .groupBy(users.id)
    .orderBy(desc(count(logs.id)));
  return rows.map((r) => ({
    ...r,
    logCount: Number(r.logCount),
    avgConfidence: Number(r.avgConfidence),
    flagged: Number(r.flagged),
  }));
}
