"use client";

import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { activityLabel, fmtDate } from "@/lib/format";
import type { ReportMatch } from "@/lib/reports";
import type { Field as FieldRow, Report } from "@/db/schema";
import { TYPE_LABEL, dateRange, typeCls } from "./reports-client";
import { cn } from "@/lib/utils";

export function ReportDetail({ report, matches }: { report: Report & { field: FieldRow | null }; matches: ReportMatch[] }) {
  const [showTranscripts, setShowTranscripts] = useState(true);

  const exportCsv = () => {
    const header = ["Date", "Employee", "Field", "Activity", "Products", "Summary", "Transcript", "Matched keywords", "Confidence"];
    const lines = matches.map((m) =>
      [fmtDate(m.createdAt), m.workerName, m.fieldCode, activityLabel(m.activityType), m.products, m.summary ?? "", m.transcript, m.matched.join("; "), m.confidence ?? ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${report.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const byActivity = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of matches) m.set(x.activityType, (m.get(x.activityType) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [matches]);

  return (
    <div className="flex flex-col gap-4 print:gap-2">
      {/* Header card */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-white p-4">
        <div className="flex flex-col gap-1.5 text-[12px] text-muted-foreground">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full border px-2 py-px text-[11px] font-medium", typeCls(report.type))}>{TYPE_LABEL[report.type]}</span>
            <span>{dateRange(report.fromDate, report.toDate)}</span>
            {report.field ? <span>· {report.field.code} — {report.field.name}</span> : <span>· all fields</span>}
          </div>
          {report.keywords.length ? (
            <div className="flex flex-wrap gap-1">
              {report.keywords.map((k) => (
                <span key={k} className="rounded bg-muted px-1.5 py-px text-[11px]">
                  {k}
                </span>
              ))}
            </div>
          ) : null}
          {report.notes ? <div className="text-foreground/80">{report.notes}</div> : null}
          <div className="flex flex-wrap gap-2 pt-1">
            {byActivity.map(([a, n]) => (
              <span key={a} className="text-[11px]">
                <span className="font-medium text-foreground">{n}</span> {activityLabel(a).toLowerCase()}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button onClick={() => setShowTranscripts((v) => !v)} className="text-[12px] text-muted-foreground hover:text-foreground">
            {showTranscripts ? "Hide transcripts" : "Show transcripts"}
          </button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer data-icon="inline-start" /> Print
          </Button>
          <Button onClick={exportCsv} disabled={!matches.length}>
            <Download data-icon="inline-start" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Matches */}
      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full min-w-[720px] table-fixed text-[13px]">
          <colgroup>
            <col className="w-[130px]" />
            <col className="w-[130px]" />
            <col className="w-[80px]" />
            <col className="w-[100px]" />
            <col className="w-[170px]" />
            <col />
          </colgroup>
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-3 py-2.5 font-medium">Employee</th>
              <th className="px-3 py-2.5 font-medium">Field</th>
              <th className="px-3 py-2.5 font-medium">Activity</th>
              <th className="px-3 py-2.5 font-medium">Products</th>
              <th className="px-3 py-2.5 font-medium">Summary</th>
            </tr>
          </thead>
          <tbody>
            {matches.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Nothing matches yet — widen the date range or add keywords.
                </td>
              </tr>
            ) : null}
            {matches.map((m) => (
              <tr key={m.id} className="border-t border-border align-top">
                <td className="whitespace-nowrap px-4 py-3">{fmtDate(m.createdAt)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-medium">{m.workerName}</td>
                <td className="whitespace-nowrap px-3 py-3">{m.fieldCode}</td>
                <td className="whitespace-nowrap px-3 py-3">{activityLabel(m.activityType)}</td>
                <td className="px-3 py-3">
                  <Highlight text={m.products || "—"} words={report.keywords} />
                </td>
                <td className="px-3 py-3">
                  <Highlight text={m.summary ?? ""} words={report.keywords} />
                  {showTranscripts ? (
                    <div className="mt-1.5 border-l-2 border-border pl-2 text-[12px] text-muted-foreground">
                      “<Highlight text={m.transcript} words={report.keywords} />”
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Wraps each keyword occurrence in a <mark>. */
function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length || !text) return <>{text}</>;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-amber-100 px-0.5 text-foreground">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
