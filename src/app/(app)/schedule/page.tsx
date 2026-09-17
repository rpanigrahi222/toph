import { PageHeader } from "@/components/page-header";
import { StubPage } from "@/components/stub-page";

export default function Page() {
  return (
    <>
      <PageHeader title="Schedule" subtitle="Planned work by field and day." search={false} />
      <StubPage>{"Planned: a week view of scheduled tasks per field, which the extraction step can use as context when a worker's log doesn't name a field."}</StubPage>
    </>
  );
}
