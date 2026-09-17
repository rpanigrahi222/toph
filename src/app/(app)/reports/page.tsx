import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { ReportsClient } from "@/components/reports/reports-client";
import { db, schema } from "@/db";
import { listFields } from "@/lib/queries";
import { runReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const [rows, fields] = await Promise.all([
    db.query.reports.findMany({ with: { field: true }, orderBy: [desc(schema.reports.createdAt)] }),
    listFields(),
  ]);
  // Match counts for the cards. Reports are small; running them all is fine.
  const withCounts = await Promise.all(rows.map(async (r) => ({ ...r, matchCount: (await runReport(r)).length })));

  return (
    <>
      <PageHeader title="Reports" subtitle="Saved views of the logs — pesticide use, fertilizer, per-field — ready to export." search={false} />
      <ReportsClient initial={withCounts} fields={fields} />
    </>
  );
}
