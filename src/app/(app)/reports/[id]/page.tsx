import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ReportDetail } from "@/components/reports/report-detail";
import { db, schema } from "@/db";
import { runReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: PageProps<"/reports/[id]">) {
  const { id } = await params;
  const report = await db.query.reports.findFirst({ where: eq(schema.reports.id, id), with: { field: true } });
  if (!report) notFound();
  const matches = await runReport(report);

  return (
    <>
      <PageHeader
        title={report.title}
        subtitle={`${matches.length} matching log${matches.length === 1 ? "" : "s"}${report.field ? ` · ${report.field.code}` : ""}`}
        search={false}
        actions={
          <Link href="/reports" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> All reports
          </Link>
        }
      />
      <ReportDetail report={report} matches={matches} />
    </>
  );
}
