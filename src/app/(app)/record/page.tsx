import { PageHeader } from "@/components/page-header";
import { Recorder } from "@/components/recorder/recorder";
import { listWorkers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function RecordPage() {
  const workers = await listWorkers();
  return (
    <>
      <PageHeader
        title="Record a log"
        subtitle="What the mobile app does in the field — speak in any language, Toph structures it."
        search={false}
      />
      <Recorder workers={workers} />
    </>
  );
}
