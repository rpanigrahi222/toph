import { format } from "date-fns";
import { PageHeader } from "@/components/page-header";
import { Calendar } from "@/components/schedule/calendar";
import { listFields, listWorkers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const [fields, workers] = await Promise.all([listFields(), listWorkers()]);
  return (
    <>
      <PageHeader title="Schedule" subtitle="Planned work by field and day, with the crew's actual voice logs alongside." search={false} />
      <Calendar fields={fields} workers={workers} initialMonth={format(new Date(), "yyyy-MM")} />
    </>
  );
}
