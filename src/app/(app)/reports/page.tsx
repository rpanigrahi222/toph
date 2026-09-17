import { PageHeader } from "@/components/page-header";
import { StubPage } from "@/components/stub-page";

export default function Page() {
  return (
    <>
      <PageHeader title="Reports" subtitle="Pesticide-use reports and exports." search={false} />
      <StubPage>{"Select rows on Activity Logs and use Export CSV for now. Planned: PDF pesticide-use report per field per month, formatted for state submission."}</StubPage>
    </>
  );
}
