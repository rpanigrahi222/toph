"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Languages, Send, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LANGUAGES, languageLabel } from "@/lib/format";
import type { Message } from "@/db/schema";
import { cn } from "@/lib/utils";

type WorkerRow = {
  id: string;
  name: string;
  preferredLanguage: string;
  lastMessage: string | null;
  lastAt: string | null;
};

export function MessagesClient({
  workers,
  initialWorkerId,
  initialDraft,
  logId,
}: {
  workers: WorkerRow[];
  initialWorkerId: string | null;
  initialDraft: string;
  logId?: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [workerId, setWorkerId] = useState(initialWorkerId);
  const [draft, setDraft] = useState(initialDraft);
  const [sender, setSender] = useState<"admin" | "worker">("admin");
  const [workerView, setWorkerView] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const worker = workers.find((w) => w.id === workerId) ?? null;
  const workerLang = worker?.preferredLanguage ?? "en";
  const native = LANGUAGES.find((l) => l.code === workerLang)?.native ?? languageLabel(workerLang);

  const { data } = useQuery({
    queryKey: ["messages", workerId],
    enabled: !!workerId,
    queryFn: async () => {
      const res = await fetch(`/api/messages?worker=${workerId}`);
      if (!res.ok) throw new Error("Failed to load messages");
      return (await res.json()).messages as Message[];
    },
  });
  const msgs = data ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [msgs.length, workerId]);

  const send = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workerId, body: draft.trim(), sender, logId: logId || undefined }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Send failed");
      return (await res.json()) as { message: Message; via: string };
    },
    onSuccess: ({ via }) => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["messages", workerId] });
      if (via === "none" && workerLang !== "en") toast.warning("Sent untranslated — ANTHROPIC_API_KEY not set");
      router.refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Send failed"),
  });

  return (
    <div className="grid h-[calc(100vh-140px)] min-h-[480px] grid-cols-[260px_1fr] overflow-hidden rounded-xl border border-border bg-white">
      {/* Worker list */}
      <aside className="overflow-y-auto border-r border-border">
        {workers.map((w) => (
          <button
            key={w.id}
            onClick={() => {
              setWorkerId(w.id);
              setSender("admin");
            }}
            className={cn(
              "flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/40",
              w.id === workerId && "bg-muted/60",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-medium">{w.name}</span>
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-px text-[10px] font-medium uppercase",
                  w.preferredLanguage === "en" ? "bg-muted text-muted-foreground" : "bg-sky-50 text-sky-700",
                )}
              >
                {w.preferredLanguage}
              </span>
            </div>
            <div className="truncate text-[12px] text-muted-foreground">
              {w.lastMessage ?? <span className="italic">No messages yet</span>}
            </div>
          </button>
        ))}
      </aside>

      {/* Thread */}
      {worker ? (
        <section className="flex min-h-0 flex-col">
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <div>
              <div className="text-[14px] font-semibold">{worker.name}</div>
              <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Languages className="size-3.5" />
                Speaks {languageLabel(workerLang)}
                {workerLang !== "en" ? ` · your English is delivered in ${native}` : ""}
              </div>
            </div>
            {workerLang !== "en" ? (
              <button
                onClick={() => setWorkerView((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                  workerView ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted",
                )}
              >
                <Smartphone className="size-3.5" />
                {workerView ? `Viewing as ${worker.name.split(" ")[0]}` : "View as worker"}
              </button>
            ) : null}
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {msgs.length === 0 ? (
              <p className="pt-10 text-center text-[13px] text-muted-foreground">
                No messages yet. Say hello — it&apos;ll arrive in {native}.
              </p>
            ) : null}
            {msgs.map((m) => (
              <Bubble key={m.id} m={m} workerView={workerView} workerLang={workerLang} />
            ))}
            <div ref={bottomRef} />
          </div>

          <form
            className="border-t border-border px-5 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim() && !send.isPending) send.mutate();
            }}
          >
            {workerLang !== "en" ? (
              <div className="mb-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                <span>Send as</span>
                <Seg active={sender === "admin"} onClick={() => setSender("admin")}>
                  Office · English
                </Seg>
                <Seg active={sender === "worker"} onClick={() => setSender("worker")}>
                  {worker.name.split(" ")[0]} · {native}
                </Seg>
                <span className="ml-auto">
                  {sender === "admin" ? `→ delivered in ${native}` : "→ delivered in English"}
                </span>
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (draft.trim() && !send.isPending) send.mutate();
                  }
                }}
                rows={2}
                placeholder={
                  sender === "admin"
                    ? `Message ${worker.name.split(" ")[0]} in English…`
                    : `Escribe como ${worker.name.split(" ")[0]}…`
                }
                className="flex-1 resize-none rounded-lg border border-border px-3 py-2 text-[13px] outline-none focus:border-foreground/40"
              />
              <Button type="submit" disabled={!draft.trim() || send.isPending} className="h-9">
                <Send data-icon="inline-start" /> {send.isPending ? "Translating…" : "Send"}
              </Button>
            </div>
          </form>
        </section>
      ) : (
        <div className="flex items-center justify-center text-[13px] text-muted-foreground">Pick a worker</div>
      )}
    </div>
  );
}

function Bubble({ m, workerView, workerLang }: { m: Message; workerView: boolean; workerLang: string }) {
  const fromAdmin = m.sender === "admin";
  const translated = m.bodyTranslated && m.bodyTranslated !== m.bodyOriginal ? m.bodyTranslated : null;

  // Office view: admin bubbles show what was written (English) with the delivered
  // translation underneath; worker bubbles show English with the original underneath.
  // Worker view flips it: everything primary is in the worker's language.
  let primary: string;
  let secondary: string | null;
  let secondaryLabel: string;
  if (fromAdmin) {
    if (workerView) {
      primary = translated ?? m.bodyOriginal;
      secondary = translated ? m.bodyOriginal : null;
      secondaryLabel = `Original · ${languageLabel(m.languageOriginal)}`;
    } else {
      primary = m.bodyOriginal;
      secondary = translated;
      secondaryLabel = `Delivered · ${languageLabel(m.languageTranslated ?? workerLang)}`;
    }
  } else {
    if (workerView) {
      primary = m.bodyOriginal;
      secondary = null;
      secondaryLabel = "";
    } else {
      primary = translated ?? m.bodyOriginal;
      secondary = translated ? m.bodyOriginal : null;
      secondaryLabel = `Original · ${languageLabel(m.languageOriginal)}`;
    }
  }

  // In worker view, the worker's own messages sit on the right.
  const alignRight = workerView ? !fromAdmin : fromAdmin;

  return (
    <div className={cn("flex", alignRight ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[70%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
          alignRight ? "rounded-br-sm bg-foreground text-background" : "rounded-bl-sm bg-muted",
        )}
      >
        <div className="whitespace-pre-wrap">{primary}</div>
        {secondary ? (
          <div className={cn("mt-1.5 border-t pt-1.5 text-[11px]", alignRight ? "border-background/20 text-background/70" : "border-border text-muted-foreground")}>
            <span className="font-medium">{secondaryLabel}:</span> {secondary}
          </div>
        ) : null}
        <div className={cn("mt-1 text-[10px]", alignRight ? "text-background/60" : "text-muted-foreground")}>
          {new Date(m.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          {m.logId ? " · about a log" : ""}
        </div>
      </div>
    </div>
  );
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
        active ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
