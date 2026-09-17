import { PageHeader } from "@/components/page-header";
import { languageLabel } from "@/lib/format";
import { workerPerformance } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const rows = await workerPerformance();
  return (
    <>
      <PageHeader title="Performance" subtitle="Logging activity and extraction quality per worker, last 30 days" search={false} />
      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Employee</th>
              <th className="px-3 py-2.5 font-medium">Language</th>
              <th className="px-3 py-2.5 font-medium">Logs</th>
              <th className="px-3 py-2.5 font-medium">Avg confidence</th>
              <th className="px-3 py-2.5 font-medium">Flagged</th>
              <th className="px-3 py-2.5 font-medium">Last log</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.workerId} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-3 py-3">{languageLabel(r.language)}</td>
                <td className="px-3 py-3">{r.logCount}</td>
                <td className="px-3 py-3">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                      <span
                        className={cn(
                          "block h-full rounded-full",
                          r.avgConfidence >= 0.8 ? "bg-emerald-500" : r.avgConfidence >= 0.5 ? "bg-amber-500" : "bg-red-500",
                        )}
                        style={{ width: `${r.avgConfidence * 100}%` }}
                      />
                    </span>
                    {r.logCount ? `${Math.round(r.avgConfidence * 100)}%` : "—"}
                  </span>
                </td>
                <td className="px-3 py-3">{r.flagged || "—"}</td>
                <td className="px-3 py-3 text-muted-foreground">
                  {r.lastLog ? new Date(r.lastLog).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
