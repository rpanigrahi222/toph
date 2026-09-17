import { PageHeader } from "@/components/page-header";
import { StubPage } from "@/components/stub-page";

export default function Page() {
  return (
    <>
      <PageHeader title="Messages" subtitle="Direct messages between the office and field crews." search={false} />
      <StubPage>{"Planned: two-way messaging, with a one-tap “please re-record” request for flagged logs."}</StubPage>
    </>
  );
}
