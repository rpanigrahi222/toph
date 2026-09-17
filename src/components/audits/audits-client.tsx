"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Select, TextArea, TextInput, toLocalInput } from "@/components/form";
import type { Audit, Field as FieldRow } from "@/db/schema";
import { cn } from "@/lib/utils";

type AuditRow = Audit & { field: FieldRow | null };

const STATUS: Record<Audit["status"], { label: string; cls: string }> = {
  scheduled: { label: "Scheduled", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  in_progress: { label: "In progress", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  passed: { label: "Passed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  findings: { label: "Findings", cls: "bg-red-50 text-red-700 border-red-200" },
};

export function AuditsClient({ initial, fields }: { initial: AuditRow[]; fields: FieldRow[] }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["audits"],
    queryFn: async () => (await (await fetch("/api/audits")).json()).audits as AuditRow[],
    initialData: initial,
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AuditRow | null>(null);

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const res = await fetch(`/api/audits/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Update failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audits"] }),
    onError: () => toast.error("Could not update inspection"),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/audits/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audits"] });
      toast.success("Inspection removed");
    },
  });

  const rows = data ?? [];
  const upcoming = rows.filter((a) => a.status === "scheduled" || a.status === "in_progress");
  const past = rows.filter((a) => a.status === "passed" || a.status === "findings").reverse();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-[13px] text-muted-foreground">
          {upcoming.length} upcoming · {past.length} completed
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus data-icon="inline-start" /> Add inspection
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-white px-6 py-10 text-center text-[13px] text-muted-foreground">
          No inspections yet. Add the next county visit or certifier audit so the crew can prep.
        </div>
      ) : null}

      {[
        ["Upcoming", upcoming],
        ["Completed", past],
      ].map(([title, list]) =>
        (list as AuditRow[]).length ? (
          <section key={title as string}>
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{title as string}</h2>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {(list as AuditRow[]).map((a) => (
                <div key={a.id} className="rounded-xl border border-border bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <ClipboardCheck className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-[14px] font-semibold">{a.title}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                        {a.agency ? (
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="size-3" /> {a.agency}
                          </span>
                        ) : null}
                        <span>{new Date(a.scheduledFor).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                        {a.field ? <span>{a.field.code}</span> : null}
                      </div>
                    </div>
                    <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium", STATUS[a.status].cls)}>
                      {STATUS[a.status].label}
                    </span>
                  </div>
                  {a.scope ? <p className="mt-2 text-[13px] text-foreground/80">{a.scope}</p> : null}
                  {a.findings ? (
                    <p className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-[12px] text-foreground/80">
                      <span className="font-medium">Findings:</span> {a.findings}
                    </p>
                  ) : null}
                  <div className="mt-3 flex items-center gap-2">
                    <Select
                      value={a.status}
                      onChange={(e) => patch.mutate({ id: a.id, body: { status: e.target.value } })}
                      className="h-8 w-auto text-[12px]"
                    >
                      {Object.entries(STATUS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </Select>
                    <Button size="sm" variant="outline" onClick={() => { setEditing(a); setOpen(true); }}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => remove.mutate(a.id)}>
                      <Trash2 data-icon="inline-start" /> Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null,
      )}

      <AuditDialog
        open={open}
        onOpenChange={setOpen}
        fields={fields}
        editing={editing}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["audits"] });
          setOpen(false);
        }}
      />
    </div>
  );
}

function AuditDialog({
  open,
  onOpenChange,
  fields,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fields: FieldRow[];
  editing: AuditRow | null;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  // Default "when" = a week out; computed once so render stays pure.
  const [defaultWhen] = useState(() => new Date(Date.now() + 7 * 864e5));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      title: fd.get("title"),
      agency: fd.get("agency") || null,
      scheduledFor: new Date(String(fd.get("scheduledFor"))).toISOString(),
      status: fd.get("status"),
      scope: fd.get("scope") || null,
      fieldId: fd.get("fieldId") || null,
      findings: fd.get("findings") || null,
    };
    setBusy(true);
    try {
      const res = await fetch(editing ? `/api/audits/${editing.id}` : "/api/audits", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      toast.success(editing ? "Inspection updated" : "Inspection added");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} key={editing?.id ?? "new"}>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit inspection" : "Add inspection"}</DialogTitle>
            <DialogDescription>Track who&apos;s coming, when, and what they&apos;ll want to see.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Title" className="col-span-2">
              <TextInput name="title" required defaultValue={editing?.title ?? ""} placeholder="County pesticide use inspection" />
            </Field>
            <Field label="Agency / auditor">
              <TextInput name="agency" defaultValue={editing?.agency ?? ""} placeholder="County Ag Commissioner" />
            </Field>
            <Field label="When">
              <TextInput name="scheduledFor" type="datetime-local" required defaultValue={toLocalInput(editing?.scheduledFor ?? defaultWhen)} />
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue={editing?.status ?? "scheduled"}>
                {Object.entries(STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Field (optional)">
              <Select name="fieldId" defaultValue={editing?.fieldId ?? ""}>
                <option value="">Whole farm</option>
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code} · {f.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Scope" className="col-span-2">
              <TextArea name="scope" rows={2} defaultValue={editing?.scope ?? ""} placeholder="Q3 pesticide use records, REI signage, worker training cards" />
            </Field>
            <Field label="Findings (after the visit)" className="col-span-2">
              <TextArea name="findings" rows={2} defaultValue={editing?.findings ?? ""} />
            </Field>
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save" : "Add inspection"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
