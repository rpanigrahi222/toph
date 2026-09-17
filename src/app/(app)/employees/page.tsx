import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { languageLabel } from "@/lib/format";
import { workerPerformance } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const rows = await workerPerformance();
  return (
    <>
      <PageHeader title="Employees" subtitle={`${rows.length} workers at Bays Ranch`} search={false} />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {rows
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((w) => (
            <Link
              key={w.workerId}
              href={`/logs?worker=${w.workerId}&month=all&status=all`}
              className="flex items-center gap-3 rounded-xl border border-border bg-white px-4 py-3 transition-colors hover:bg-muted/40"
            >
              <div className="flex size-9 items-center justify-center rounded-full bg-muted text-[12px] font-semibold">
                {w.name
                  .split(" ")
                  .map((p) => p[0])
                  .join("")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{w.name}</div>
                <div className="text-[12px] text-muted-foreground">
                  Speaks {languageLabel(w.language)} · {w.logCount} log{w.logCount === 1 ? "" : "s"} / 30d
                </div>
              </div>
            </Link>
          ))}
      </div>
    </>
  );
}
