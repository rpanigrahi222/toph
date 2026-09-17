import { PageHeader } from "@/components/page-header";
import { StubPage } from "@/components/stub-page";

export default function Page() {
  return (
    <>
      <PageHeader title="Audit Manager" subtitle="Sign-off workflow for chemical application records." search={false} />
      <StubPage>{"Every edit to a log is already captured in the audit trail on the log itself. This page would surface open items by regulatory deadline (e.g. state pesticide-use reporting) and let an auditor sign off in bulk."}</StubPage>
    </>
  );
}
