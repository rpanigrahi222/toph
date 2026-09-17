import { PageHeader } from "@/components/page-header";
import { StubPage } from "@/components/stub-page";

export default function Page() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Farm, fields, products and language defaults." search={false} />
      <StubPage>{"Planned: manage the field boundaries and product list that drive extraction and Deepgram keyterm boosting, plus each worker's default language."}</StubPage>
    </>
  );
}
