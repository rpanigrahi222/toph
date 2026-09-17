import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { AuditsClient } from "@/components/audits/audits-client";
import { db, schema } from "@/db";
import { listFields } from "@/lib/queries";
import { activityLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

const { audits, auditEvents, logs, users, fields } = schema;

export default async function AuditPage() {
  const [rows, fieldRows, history] = await Promise.all([
    db.query.audits.findMany({ with: { field: true }, orderBy: [asc(audits.scheduledFor)] }),
    listFields(),
    db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        diff: auditEvents.diff,
        createdAt: auditEvents.createdAt,
        userName: users.name,
        logId: logs.id,
        activity: logs.activityType,
        fieldCode: fields.code,
        workerName: logs.workerId,
      })
      .from(auditEvents)
      .innerJoin(logs, eq(auditEvents.logId, logs.id))
      .leftJoin(users, eq(auditEvents.userId, users.id))
      .leftJoin(fields, eq(logs.fieldId, fields.id))
      .orderBy(desc(auditEvents.createdAt))
      .limit(40),
  ]);

  return (
    <>
      <PageHeader title="Audit Manager" subtitle="Inspections on the calendar, and a tamper-evident history of every change to a log." search={false} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
        <AuditsClient initial={rows} fields={fieldRows} />

        <aside className="rounded-xl border border-border bg-white">
          <div className="border-b border-border px-4 py-3">
            <div className="text-[13px] font-semibold">Change history</div>
            <div className="text-[12px] text-muted-foreground">Every create, edit, review and tag across all logs</div>
          </div>
          <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
            {history.map((h) => (
              <li key={h.id} className="px-4 py-2.5 text-[12px]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{h.userName ?? "System"}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {new Date(h.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                <div className="text-foreground/80">
                  {describe(h.action, h.diff)}{" "}
                  <Link href={`/logs?status=all&month=all&q=${encodeURIComponent(h.fieldCode ?? "")}`} className="text-muted-foreground underline-offset-2 hover:underline">
                    {activityLabel(h.activity)} · {h.fieldCode ?? "no field"}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </>
  );
}

function describe(action: string, diff: Record<string, unknown> | null) {
  switch (action) {
    case "created":
      return (diff as { source?: string })?.source === "offline" ? "recorded (offline) a log:" : "recorded a log:";
    case "reviewed":
      return "marked reviewed:";
    case "edited":
      return `changed ${diff ? Object.keys(diff).join(", ") : "a log"} on:`;
    case "tag_added":
      return `tagged “${(diff as { tag?: string })?.tag}”:`;
    case "tag_removed":
      return "removed a tag from:";
    default:
      return `${action}:`;
  }
}
