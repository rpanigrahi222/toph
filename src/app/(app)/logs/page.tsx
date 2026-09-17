import { PageHeader } from "@/components/page-header";
import { LogsTable } from "@/components/logs/logs-table";
import { filtersFromSearchParams } from "@/lib/filters";
import { listFields, listLogs, listWorkers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function LogsPage({ searchParams }: PageProps<"/logs">) {
  const sp = await searchParams;
  const raw = filtersFromSearchParams(sp);
  // Activity Logs defaults to everything; the dashboard is the "new" inbox.
  const filters = { ...raw, status: sp.status ? raw.status : ("all" as const), thisMonth: sp.month === "all" ? false : raw.thisMonth };

  const [logs, fields, workers] = await Promise.all([listLogs(filters), listFields(), listWorkers()]);

  return (
    <>
      <PageHeader title="Activity Logs" subtitle="Every voice log, searchable and exportable" />
      <LogsTable title="All Logs" initial={logs} fields={fields} workers={workers} showStatus />
    </>
  );
}
