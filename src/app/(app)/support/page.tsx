import { PageHeader } from "@/components/page-header";
import { StubPage } from "@/components/stub-page";

export default function Page() {
  return (
    <>
      <PageHeader title="Support" subtitle="Help and documentation." search={false} />
      <StubPage>{"Planned: in-app help. For now, see the README for architecture and setup."}</StubPage>
    </>
  );
}
