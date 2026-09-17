"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Select, TextArea, TextInput, toLocalInput } from "@/components/form";
import type { Field as FieldRow, Report, ReportType } from "@/db/schema";
import { cn } from "@/lib/utils";

type ReportRow = Report & { field: FieldRow | null; matchCount: number };

/** Mirrors REPORT_PRESETS on the server (kept here so the dialog is instant). */
const PRESETS: Record<ReportType, { title: string; description: string; hint: string }> = {
  pesticide_use: {
    title: "Pesticide use report",
    description: "Every spray — herbicides, insecticides, fungicides — with product, rate and field.",
    hint: "spray · herbicide · insecticide · fungicide · + every chemical in your product list",
  },
  fertilizer: {
    title: "Fertilizer applications",
    description: "Nutrient applications for nutrient-management plans.",
    hint: "fertilizer · urea · anhydrous · nitrogen · + your fertilizer products",
  },
  field_activity: {
    title: "Field activity log",
    description: "Everything that happened on one field in a date range.",
    hint: "No keywords — pick a field below",
  },
  custom: {
    title: "Custom report",
    description: "Your own keywords.",
    hint: "e.g. aphid, leak, tower four, wet",
  },
};

export const TYPE_LABEL: Record<ReportType, string> = {
  pesticide_use: "Pesticide use",
  fertilizer: "Fertilizer",
  field_activity: "Field activity",
  custom: "Custom",
};

export function ReportsClient({ initial, fields }: { initial: ReportRow[]; fields: FieldRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const remove = async (id: string) => {
    await fetch(`/api/reports/${id}`, { method: "DELETE" });
    toast.success("Report deleted");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-[13px] text-muted-foreground">
          Reports are live queries — they pick up new logs automatically.
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus data-icon="inline-start" /> Add report
        </Button>
      </div>

      {initial.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-white px-6 py-10 text-center text-[13px] text-muted-foreground">
          No reports yet. Start with a Pesticide use report — it&apos;s what the county asks for.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {initial.map((r) => (
          <Link
            key={r.id}
            href={`/reports/${r.id}`}
            className="group rounded-xl border border-border bg-white p-4 transition-colors hover:bg-muted/30"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-[14px] font-semibold">{r.title}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                  <span className={cn("rounded-full border px-2 py-px text-[11px] font-medium", typeCls(r.type))}>{TYPE_LABEL[r.type]}</span>
                  {r.field ? <span>{r.field.code}</span> : null}
                  <span>{dateRange(r.fromDate, r.toDate)}</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[22px] font-semibold leading-none">{r.matchCount}</div>
                <div className="text-[11px] text-muted-foreground">logs</div>
              </div>
            </div>
            {r.keywords.length ? (
              <div className="mt-2 truncate text-[11px] text-muted-foreground">
                {r.keywords.slice(0, 8).join(" · ")}
                {r.keywords.length > 8 ? ` · +${r.keywords.length - 8} more` : ""}
              </div>
            ) : null}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[12px] text-muted-foreground group-hover:text-foreground">Open →</span>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  remove(r.id);
                }}
                className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" /> Delete
              </button>
            </div>
          </Link>
        ))}
      </div>

      <ReportDialog
        open={open}
        onOpenChange={setOpen}
        fields={fields}
        onCreated={(id) => {
          setOpen(false);
          router.push(`/reports/${id}`);
        }}
      />
    </div>
  );
}

function ReportDialog({
  open,
  onOpenChange,
  fields,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fields: FieldRow[];
  onCreated: (id: string) => void;
}) {
  const [type, setType] = useState<ReportType>("pesticide_use");
  const [title, setTitle] = useState(PRESETS.pesticide_use.title);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      title: fd.get("title"),
      type,
      keywords: String(fd.get("keywords") ?? "")
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
      fieldId: fd.get("fieldId") || null,
      fromDate: fd.get("fromDate") ? new Date(String(fd.get("fromDate"))).toISOString() : null,
      toDate: fd.get("toDate") ? new Date(String(fd.get("toDate")) + "T23:59:59").toISOString() : null,
      notes: fd.get("notes") || null,
    };
    if (type === "custom" && (body.keywords as string[]).length === 0) {
      toast.error("Add at least one keyword for a custom report");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      const { report } = await res.json();
      toast.success("Report created");
      onCreated(report.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add report</DialogTitle>
            <DialogDescription>Pick a preset — the keywords come from it and from your product list — then narrow by field and dates.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {(Object.keys(PRESETS) as ReportType[]).map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => {
                  setType(k);
                  setTitle(PRESETS[k].title);
                }}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left transition-colors",
                  type === k ? "border-foreground bg-muted/60" : "border-border hover:bg-muted/40",
                )}
              >
                <div className="text-[13px] font-medium">{PRESETS[k].title}</div>
                <div className="text-[11px] text-muted-foreground">{PRESETS[k].description}</div>
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Title" className="col-span-2">
              <TextInput name="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label={type === "custom" ? "Keywords (comma-separated)" : "Extra keywords (optional)"} className="col-span-2">
              <TextInput name="keywords" placeholder={PRESETS[type].hint} />
            </Field>
            <Field label={type === "field_activity" ? "Field" : "Field (optional)"}>
              <Select name="fieldId" required={type === "field_activity"} defaultValue="">
                <option value="">All fields</option>
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code} · {f.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="From">
                <TextInput name="fromDate" type="date" defaultValue={toLocalInput(monthStart, false)} />
              </Field>
              <Field label="To">
                <TextInput name="toDate" type="date" />
              </Field>
            </div>
            <Field label="Notes (optional)" className="col-span-2">
              <TextArea name="notes" rows={2} placeholder="Who it's for, when it's due" />
            </Field>
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create report"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function typeCls(t: ReportType) {
  return {
    pesticide_use: "bg-red-50 text-red-700 border-red-200",
    fertilizer: "bg-emerald-50 text-emerald-700 border-emerald-200",
    field_activity: "bg-sky-50 text-sky-700 border-sky-200",
    custom: "bg-muted text-muted-foreground border-border",
  }[t];
}

export function dateRange(from: Date | string | null, to: Date | string | null) {
  const f = (d: Date | string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (from && to) return `${f(from)} – ${f(to)}`;
  if (from) return `since ${f(from)}`;
  if (to) return `until ${f(to)}`;
  return "all time";
}
