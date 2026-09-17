import { Calendar, Percent, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { LogsTable } from "@/components/logs/logs-table";
import { filtersFromSearchParams } from "@/lib/filters";
import { getDashboardStats, listFields, listLogs, listWorkers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const filters = { ...filtersFromSearchParams(sp), status: "new" as const };

  const [stats, logs, fields, workers] = await Promise.all([
    getDashboardStats(),
    listLogs(filters),
    listFields(),
    listWorkers(),
  ]);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="An overview of your farm and employee activity" />

      <div className="mb-4 grid grid-cols-3 gap-4">
        <StatCard
          icon={Calendar}
          label="Todays Recordings"
          value={stats.todayRecordings}
          hint={stats.todayNew ? `${stats.todayNew} New` : "All reviewed"}
        />
        <StatCard
          icon={Users}
          label="Active Workers"
          value={stats.activeWorkers}
          hint={`of ${stats.totalWorkers} · last 7 days`}
        />
        <StatCard
          icon={Percent}
          label="Response Accuracy"
          value={stats.responseAccuracy}
          hint={stats.needsReview ? `${stats.needsReview} need review` : "No flags"}
          hintTone={stats.needsReview ? "warn" : "good"}
        />
      </div>

      <LogsTable title="New Employee Logs" initial={logs} fields={fields} workers={workers} />
    </>
  );
}
