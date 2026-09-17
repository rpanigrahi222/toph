import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", ["admin", "worker"]);

export const activityType = pgEnum("activity_type", [
  "spraying",
  "fertilizing",
  "planting",
  "irrigating",
  "harvesting",
  "scouting",
  "pruning",
  "soil_work",
  "equipment_maintenance",
  "other",
]);

export const logStatus = pgEnum("log_status", ["new", "reviewed", "flagged"]);
export const logSource = pgEnum("log_source", ["online", "offline"]);

export const productType = pgEnum("product_type", [
  "fertilizer",
  "herbicide",
  "insecticide",
  "fungicide",
  "other",
]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const farms = pgTable("farms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  farmId: uuid("farm_id").references(() => farms.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  role: userRole("role").notNull().default("worker"),
  avatarUrl: text("avatar_url"),
  preferredLanguage: text("preferred_language").notNull().default("en"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const fields = pgTable("fields", {
  id: uuid("id").primaryKey().defaultRandom(),
  farmId: uuid("farm_id").references(() => farms.id, { onDelete: "cascade" }).notNull(),
  code: text("code").notNull(), // "FIELD A"
  name: text("name").notNull(),
  acres: numeric("acres", { precision: 8, scale: 2 }),
  // GeoJSON Polygon. Kept as jsonb so we don't need PostGIS on Neon's free tier.
  geometry: jsonb("geometry").$type<GeoJSON.Polygon>().notNull(),
  centroidLat: numeric("centroid_lat", { precision: 10, scale: 6 }).notNull(),
  centroidLng: numeric("centroid_lng", { precision: 10, scale: 6 }).notNull(),
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  farmId: uuid("farm_id").references(() => farms.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  type: productType("type").notNull(),
  activeIngredient: text("active_ingredient"),
  // Restricted-entry interval from the product label. Drives the REI countdown.
  reiHours: integer("rei_hours").notNull().default(0),
  // Alternate spellings / brand names. Fed to Deepgram as keyterms.
  aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
});

export const logs = pgTable(
  "logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    farmId: uuid("farm_id").references(() => farms.id, { onDelete: "cascade" }).notNull(),
    workerId: uuid("worker_id").references(() => users.id, { onDelete: "set null" }),
    fieldId: uuid("field_id").references(() => fields.id, { onDelete: "set null" }),

    activityType: activityType("activity_type").notNull().default("other"),
    status: logStatus("status").notNull().default("new"),
    source: logSource("source").notNull().default("online"),

    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),

    languageDetected: text("language_detected"),
    transcriptRaw: text("transcript_raw").notNull().default(""),
    transcriptEn: text("transcript_en"),
    summary: text("summary"),

    audioUrl: text("audio_url"),
    audioMime: text("audio_mime"),
    durationS: numeric("duration_s", { precision: 8, scale: 2 }),
    // Precomputed waveform peaks (-1..1) so we can draw seeded logs with no audio.
    peaks: jsonb("peaks").$type<number[]>(),

    // 0..1 from the extraction step. Feeds "Response Accuracy" and the review flag.
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    needsReview: boolean("needs_review").notNull().default(false),
    reviewReason: text("review_reason"),
    // Full structured extraction, kept verbatim for auditability.
    extraction: jsonb("extraction").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
  },
  (t) => [
    index("logs_farm_created_idx").on(t.farmId, t.createdAt),
    index("logs_status_idx").on(t.status),
  ],
);

export const logApplications = pgTable("log_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  logId: uuid("log_id").references(() => logs.id, { onDelete: "cascade" }).notNull(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  productName: text("product_name").notNull(), // as spoken, even if unmatched
  rate: numeric("rate", { precision: 10, scale: 3 }),
  unit: text("unit"),
});

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  farmId: uuid("farm_id").references(() => farms.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#d1fae5"),
});

export const logTags = pgTable(
  "log_tags",
  {
    logId: uuid("log_id").references(() => logs.id, { onDelete: "cascade" }).notNull(),
    tagId: uuid("tag_id").references(() => tags.id, { onDelete: "cascade" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.logId, t.tagId] })],
);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  logId: uuid("log_id").references(() => logs.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(), // "created" | "reviewed" | "field_changed" | "tag_added" ...
  diff: jsonb("diff").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const logsRelations = relations(logs, ({ one, many }) => ({
  worker: one(users, { fields: [logs.workerId], references: [users.id] }),
  field: one(fields, { fields: [logs.fieldId], references: [fields.id] }),
  applications: many(logApplications),
  logTags: many(logTags),
  auditEvents: many(auditEvents),
}));

export const logApplicationsRelations = relations(logApplications, ({ one }) => ({
  log: one(logs, { fields: [logApplications.logId], references: [logs.id] }),
  product: one(products, { fields: [logApplications.productId], references: [products.id] }),
}));

export const logTagsRelations = relations(logTags, ({ one }) => ({
  log: one(logs, { fields: [logTags.logId], references: [logs.id] }),
  tag: one(tags, { fields: [logTags.tagId], references: [tags.id] }),
}));

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  log: one(logs, { fields: [auditEvents.logId], references: [logs.id] }),
  user: one(users, { fields: [auditEvents.userId], references: [users.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  logs: many(logs),
}));

export const fieldsRelations = relations(fields, ({ many }) => ({
  logs: many(logs),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Farm = typeof farms.$inferSelect;
export type User = typeof users.$inferSelect;
export type Field = typeof fields.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Log = typeof logs.$inferSelect;
export type LogApplication = typeof logApplications.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;

export type ActivityType = (typeof activityType.enumValues)[number];
export type LogStatus = (typeof logStatus.enumValues)[number];
