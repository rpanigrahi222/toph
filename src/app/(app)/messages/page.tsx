import { eq, sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { MessagesClient } from "@/components/messages/messages-client";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

const { users } = schema;

export default async function MessagesPage({ searchParams }: PageProps<"/messages">) {
  const sp = await searchParams;
  const workers = await db
    .select({
      id: users.id,
      name: users.name,
      preferredLanguage: users.preferredLanguage,
      lastMessage: sql<string | null>`(select body_original from messages m where m.worker_id = users.id order by created_at desc limit 1)`,
      lastAt: sql<Date | null>`(select max(created_at) from messages m where m.worker_id = users.id)`,
    })
    .from(users)
    .where(eq(users.role, "worker"))
    .orderBy(sql`(select max(created_at) from messages m where m.worker_id = users.id) desc nulls last`, users.name);

  const initialWorker = (Array.isArray(sp.worker) ? sp.worker[0] : sp.worker) ?? workers[0]?.id ?? null;
  const draft = Array.isArray(sp.draft) ? sp.draft[0] : sp.draft;
  const logId = Array.isArray(sp.log) ? sp.log[0] : sp.log;

  return (
    <>
      <PageHeader
        title="Messages"
        subtitle="Write in English — every worker reads it in their own language."
        search={false}
      />
      <MessagesClient
        workers={workers.map((w) => ({ ...w, lastAt: w.lastAt ? new Date(w.lastAt).toISOString() : null }))}
        initialWorkerId={initialWorker}
        initialDraft={draft ?? ""}
        logId={logId}
      />
    </>
  );
}
