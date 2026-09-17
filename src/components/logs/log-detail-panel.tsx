"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Expand, Languages, MessageSquare, Star, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldMapLazy } from "@/components/map/field-map-lazy";
import { activityLabel, ACTIVITY_LABELS, fmtDate, fmtTimeRange, languageLabel } from "@/lib/format";
import type { LogDetail } from "@/lib/queries";
import type { Field } from "@/db/schema";
import { Waveform } from "./waveform";
import { cn } from "@/lib/utils";

export function LogDetailPanel({ id, fields, onChanged }: { id: string; fields: Field[]; onChanged?: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["log", id],
    queryFn: async () => {
      const res = await fetch(`/api/logs/${id}`);
      if (!res.ok) throw new Error("Failed to load log");
      return (await res.json()).log as LogDetail;
    },
  });

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/logs/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Update failed");
      return (await res.json()).log as LogDetail;
    },
    onSuccess: (log) => {
      qc.setQueryData(["log", id], log);
      onChanged?.();
    },
    onError: () => toast.error("Could not save change"),
  });

  const [mapOpen, setMapOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState("");

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-8">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const log = data;
  const nonEnglish = !!log.languageDetected && log.languageDetected !== "en" && log.languageDetected !== "multi";
  const mapFields = fields.map((f) => ({
    id: f.id,
    code: f.code,
    name: f.name,
    geometry: f.geometry,
    centroidLat: Number(f.centroidLat),
    centroidLng: Number(f.centroidLng),
    highlighted: f.id === log.fieldId,
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* Review callout — shown for flagged logs */}
      {log.needsReview ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div className="flex-1">
            <div className="font-medium text-amber-900">Needs review · confidence {pct(log.confidence)}</div>
            <div className="mt-0.5 text-amber-800">{log.reviewReason}</div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <select
                className="h-8 rounded-md border border-amber-300 bg-white px-2 text-[12px]"
                value={log.fieldId ?? ""}
                onChange={(e) => patch.mutate({ fieldId: e.target.value || null })}
              >
                <option value="">No field</option>
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code} · {f.name}
                  </option>
                ))}
              </select>
              <select
                className="h-8 rounded-md border border-amber-300 bg-white px-2 text-[12px]"
                value={log.activityType}
                onChange={(e) => patch.mutate({ activityType: e.target.value })}
              >
                {Object.entries(ACTIVITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={() => patch.mutate({ status: "reviewed" })} disabled={patch.isPending}>
                <Check data-icon="inline-start" /> Mark reviewed
              </Button>
              {log.workerId ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-300 bg-white"
                  render={
                    <Link
                      href={`/messages?worker=${log.workerId}&log=${log.id}&draft=${encodeURIComponent(
                        `Hi ${log.workerName.split(" ")[0]}, I couldn't tell which field or product your log from ${fmtDate(log.createdAt)} was about. Could you record it again with the field name and what you applied? Thanks!`,
                      )}`}
                    />
                  }
                >
                  <MessageSquare data-icon="inline-start" /> Ask to re-record
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.15fr_1fr]">
        {/* Left: audio + summary */}
        <div className="flex flex-col gap-3">
          <Waveform peaks={log.peaks} audioUrl={log.audioUrl} durationS={log.durationS} />

          {/* Tags */}
          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    className="h-9 flex-1 rounded-lg border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                  >
                    <Star data-icon="inline-start" /> Add Tag
                  </Button>
                }
              />
              <PopoverContent className="w-56 p-2">
                <form
                  className="flex gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!tagDraft.trim()) return;
                    patch.mutate({ addTag: tagDraft.trim() });
                    setTagDraft("");
                  }}
                >
                  <input
                    autoFocus
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    placeholder="e.g. Compliance"
                    className="h-8 flex-1 rounded-md border border-border px-2 text-[12px]"
                  />
                  <Button size="sm" type="submit">
                    Add
                  </Button>
                </form>
              </PopoverContent>
            </Popover>
          </div>
          {log.tags.length ? (
            <div className="flex flex-wrap gap-1.5">
              {log.tags.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium"
                  style={{ background: t.color }}
                >
                  {t.name}
                  <button onClick={() => patch.mutate({ removeTagId: t.id })} className="text-foreground/50 hover:text-foreground">
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          {/* Summary / transcript */}
          <div className="mt-1">
            <h3 className="text-[13px] font-semibold">Summary</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{log.summary}</p>

            {nonEnglish && log.transcriptEn ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-sky-100 bg-sky-50/40 p-3">
                  <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-sky-900">
                    <Languages className="size-3.5" /> As spoken · {languageLabel(log.languageDetected)}
                  </h3>
                  <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/80">“{log.transcriptRaw}”</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <h3 className="text-[12px] font-semibold">English translation</h3>
                  <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/80">“{log.transcriptEn}”</p>
                </div>
              </div>
            ) : (
              <>
                <h3 className="mt-4 text-[13px] font-semibold">
                  Transcript <span className="font-normal text-muted-foreground">· {languageLabel(log.languageDetected)}</span>
                </h3>
                <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">“{log.transcriptRaw}”</p>
              </>
            )}
          </div>
        </div>

        {/* Right: map + extracted data */}
        <div className="flex flex-col gap-3">
          <div className="h-[260px] w-full">
            <FieldMapLazy fields={mapFields} focusCode={log.field?.code} interactive={false} showLabels={false} />
          </div>
          <Button variant="outline" className="h-9 w-full rounded-lg" onClick={() => setMapOpen(true)}>
            <Expand data-icon="inline-start" /> Expand Map
          </Button>

          <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12px]">
            <Item label="Activity" value={activityLabel(log.activityType)} />
            <Item label="Field" value={log.field ? `${log.field.code} · ${log.field.name}` : "Not stated"} />
            <Item label="Date" value={fmtDate(log.createdAt)} />
            <Item label="Time" value={fmtTimeRange(log.startedAt, log.endedAt)} />
            <Item
              className="col-span-2"
              label="Products"
              value={
                log.applications.length
                  ? log.applications.map((a) => `${a.productName}${a.rate ? ` @ ${a.rate} ${a.unit ?? ""}` : ""}`).join(", ")
                  : "None"
              }
            />
            <Item
              label="Confidence"
              value={
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        (log.confidence ?? 0) >= 0.8 ? "bg-emerald-500" : (log.confidence ?? 0) >= 0.5 ? "bg-amber-500" : "bg-red-500",
                      )}
                      style={{ width: `${(log.confidence ?? 0) * 100}%` }}
                    />
                  </span>
                  {pct(log.confidence)}
                </span>
              }
            />
            <Item label="Language" value={languageLabel(log.languageDetected)} />
            <Item label="Source" value={log.source === "offline" ? "Offline · synced later" : "Online"} />
            <Item label="Status" value={<StatusBadge status={log.status} />} />
          </dl>

          {/* Audit trail */}
          <div className="mt-1 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Audit trail</div>
            <ul className="mt-1.5 flex flex-col gap-1 text-[12px]">
              {log.audit.map((e) => (
                <li key={e.id} className="flex items-baseline gap-2">
                  <span className="w-[120px] shrink-0 text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                  <span>
                    <span className="font-medium">{e.userName ?? "System"}</span> {describeAudit(e.action, e.diff)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent className="h-[80vh] max-w-5xl p-0 sm:max-w-5xl">
          <DialogTitle className="sr-only">Field map</DialogTitle>
          <div className="h-full w-full">
            {mapOpen ? <FieldMapLazy fields={mapFields} focusCode={log.field?.code} /> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Item({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate">{value}</dd>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    new: "bg-emerald-50 text-emerald-700 border-emerald-200",
    reviewed: "bg-muted text-muted-foreground border-border",
    flagged: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span className={cn("inline-block rounded-full border px-2 py-px text-[11px] font-medium capitalize", map[status] ?? map.new)}>
      {status}
    </span>
  );
}

function pct(v: number | null) {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

function describeAudit(action: string, diff: Record<string, unknown> | null) {
  switch (action) {
    case "created":
      return `recorded this log${(diff as { source?: string })?.source === "offline" ? " (offline)" : ""}`;
    case "reviewed":
      return "marked it reviewed";
    case "tag_added":
      return `added tag “${(diff as { tag?: string })?.tag}”`;
    case "tag_removed":
      return "removed a tag";
    case "edited": {
      const keys = diff ? Object.keys(diff) : [];
      return `changed ${keys.join(", ") || "the log"}`;
    }
    default:
      return action;
  }
}
