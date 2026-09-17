"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { Check, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Select, TextArea, TextInput, toLocalInput } from "@/components/form";
import { ACTIVITY_LABELS, activityLabel } from "@/lib/format";
import type { ActivityType, Field as FieldRow, ScheduleTask, User } from "@/db/schema";
import { cn } from "@/lib/utils";

type Task = ScheduleTask & { field: FieldRow | null; worker: User | null };
type MonthData = { tasks: Task[]; logsByDay: Record<string, number> };

/** Chip colour per activity — matches the map/REI palette where it overlaps. */
const ACTIVITY_CLS: Record<ActivityType, string> = {
  spraying: "bg-red-50 text-red-800 border-red-200",
  fertilizing: "bg-emerald-50 text-emerald-800 border-emerald-200",
  planting: "bg-lime-50 text-lime-800 border-lime-200",
  irrigating: "bg-sky-50 text-sky-800 border-sky-200",
  harvesting: "bg-amber-50 text-amber-800 border-amber-200",
  scouting: "bg-violet-50 text-violet-800 border-violet-200",
  pruning: "bg-teal-50 text-teal-800 border-teal-200",
  soil_work: "bg-stone-100 text-stone-800 border-stone-200",
  equipment_maintenance: "bg-zinc-100 text-zinc-800 border-zinc-200",
  other: "bg-muted text-foreground border-border",
};

export function Calendar({ fields, workers, initialMonth }: { fields: FieldRow[]; workers: User[]; initialMonth: string }) {
  const qc = useQueryClient();
  const [month, setMonth] = useState(() => startOfMonth(new Date(initialMonth + "-01T00:00:00")));
  const key = format(month, "yyyy-MM");

  const { data } = useQuery({
    queryKey: ["schedule", key],
    queryFn: async () => (await (await fetch(`/api/schedule?month=${key}`)).json()) as MonthData,
    placeholderData: (prev) => prev,
  });
  const tasks = data?.tasks ?? [];
  const logsByDay = data?.logsByDay ?? {};

  const [dialog, setDialog] = useState<{ open: boolean; task: Task | null; date: Date | null }>({ open: false, task: null, date: null });
  const openNew = (date: Date) => setDialog({ open: true, task: null, date });
  const openEdit = (task: Task) => setDialog({ open: true, task, date: null });
  const refresh = () => qc.invalidateQueries({ queryKey: ["schedule"] });

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const res = await fetch(`/api/schedule/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
    },
    onSuccess: refresh,
    onError: () => toast.error("Could not update task"),
  });

  const gridStart = startOfWeek(month);
  const gridEnd = endOfWeek(endOfMonth(month));
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const tasksOn = (d: Date) => tasks.filter((t) => isSameDay(new Date(t.startsAt), d));
  const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

  const planned = tasks.filter((t) => t.status === "planned" && isSameMonth(new Date(t.startsAt), month)).length;
  const done = tasks.filter((t) => t.status === "done" && isSameMonth(new Date(t.startsAt), month)).length;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => setMonth(subMonths(month, 1))} aria-label="Previous month">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
            <ChevronRight />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
            Today
          </Button>
        </div>
        <h2 className="ml-1 text-[16px] font-semibold">{format(month, "MMMM yyyy")}</h2>
        <span className="text-[12px] text-muted-foreground">
          {planned} planned · {done} done
        </span>
        <Button className="ml-auto" onClick={() => openNew(new Date())}>
          <Plus data-icon="inline-start" /> Add task
        </Button>
      </div>

      {/* Month grid (≥ md) */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-white md:block">
        <div className="grid grid-cols-7 border-b border-border text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-2 py-1.5">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const inMonth = isSameMonth(d, month);
            const list = tasksOn(d);
            const nLogs = logsByDay[dayKey(d)] ?? 0;
            return (
              <div
                key={i}
                onClick={() => openNew(d)}
                className={cn(
                  "group flex min-h-[104px] cursor-pointer flex-col gap-1 border-b border-r border-border p-1.5 transition-colors hover:bg-muted/30",
                  (i + 1) % 7 === 0 && "border-r-0",
                  i >= days.length - 7 && "border-b-0",
                  !inMonth && "bg-muted/20 text-muted-foreground",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-[12px]",
                      isToday(d) && "bg-foreground font-semibold text-background",
                    )}
                  >
                    {format(d, "d")}
                  </span>
                  {nLogs ? (
                    <Link
                      href={`/logs?status=all&month=all&from=${dayKey(d)}&to=${dayKey(d)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-full bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
                      title={`${nLogs} voice log${nLogs === 1 ? "" : "s"} recorded`}
                    >
                      {nLogs} log{nLogs === 1 ? "" : "s"}
                    </Link>
                  ) : null}
                </div>
                {list.slice(0, 3).map((t) => (
                  <TaskChip key={t.id} task={t} onClick={() => openEdit(t)} />
                ))}
                {list.length > 3 ? <div className="px-1 text-[10px] text-muted-foreground">+{list.length - 3} more</div> : null}
                <div className="mt-auto hidden pt-0.5 text-[10px] text-muted-foreground group-hover:block">+ add</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agenda (< md) */}
      <div className="flex flex-col gap-2 md:hidden">
        {days
          .filter((d) => isSameMonth(d, month) && (tasksOn(d).length || isToday(d)))
          .map((d) => (
            <div key={dayKey(d)} className="rounded-xl border border-border bg-white p-3">
              <div className="flex items-center justify-between">
                <div className={cn("text-[13px] font-semibold", isToday(d) && "text-emerald-700")}>{format(d, "EEE, MMM d")}</div>
                <button onClick={() => openNew(d)} className="text-[12px] text-muted-foreground">
                  + add
                </button>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                {tasksOn(d).map((t) => (
                  <TaskChip key={t.id} task={t} onClick={() => openEdit(t)} big />
                ))}
                {!tasksOn(d).length ? <div className="text-[12px] text-muted-foreground">Nothing planned</div> : null}
              </div>
            </div>
          ))}
      </div>

      <TaskDialog
        key={dialog.task?.id ?? dialog.date?.toISOString() ?? "closed"}
        open={dialog.open}
        onOpenChange={(open) => setDialog((s) => ({ ...s, open }))}
        task={dialog.task}
        date={dialog.date}
        fields={fields}
        workers={workers}
        onSaved={() => {
          refresh();
          setDialog({ open: false, task: null, date: null });
        }}
        onToggleDone={(t) => patch.mutate({ id: t.id, body: { status: t.status === "done" ? "planned" : "done" } })}
      />
    </div>
  );
}

function TaskChip({ task: t, onClick, big }: { task: Task; onClick: () => void; big?: boolean }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex w-full items-center gap-1 truncate rounded border px-1.5 text-left transition-opacity",
        big ? "py-1.5 text-[12px]" : "py-px text-[11px]",
        ACTIVITY_CLS[t.activityType],
        t.status === "done" && "opacity-55 line-through",
        t.status === "cancelled" && "opacity-40 line-through",
      )}
      title={`${t.title}${t.field ? ` · ${t.field.code}` : ""}${t.worker ? ` · ${t.worker.name}` : ""}`}
    >
      {t.status === "done" ? <Check className="size-3 shrink-0" /> : null}
      <span className="truncate">
        {format(new Date(t.startsAt), "h:mma").toLowerCase().replace(":00", "")} {t.title}
        {t.field ? <span className="opacity-70"> · {t.field.code.replace("FIELD ", "")}</span> : null}
      </span>
    </button>
  );
}

function TaskDialog({
  open,
  onOpenChange,
  task,
  date,
  fields,
  workers,
  onSaved,
  onToggleDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task: Task | null;
  date: Date | null;
  fields: FieldRow[];
  workers: User[];
  onSaved: () => void;
  onToggleDone: (t: Task) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<ActivityType>(task?.activityType ?? "spraying");
  const defaultStart = task ? new Date(task.startsAt) : date ? new Date(new Date(date).setHours(7, 0, 0, 0)) : new Date();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      title: fd.get("title"),
      activityType: fd.get("activityType"),
      fieldId: fd.get("fieldId") || null,
      workerId: fd.get("workerId") || null,
      startsAt: new Date(String(fd.get("startsAt"))).toISOString(),
      endsAt: fd.get("endsAt") ? new Date(String(fd.get("endsAt"))).toISOString() : null,
      notes: fd.get("notes") || null,
    };
    setBusy(true);
    try {
      const res = await fetch(task ? `/api/schedule/${task.id}` : "/api/schedule", {
        method: task ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      toast.success(task ? "Task updated" : "Task added");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!task) return;
    await fetch(`/api/schedule/${task.id}`, { method: "DELETE" });
    toast.success("Task removed");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{task ? "Edit task" : `Plan work${date ? ` · ${format(date, "EEE, MMM d")}` : ""}`}</DialogTitle>
            <DialogDescription>What&apos;s planned, where, and who&apos;s doing it. The crew&apos;s voice logs show up next to it as they happen.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Title" className="col-span-2">
              <TextInput name="title" required defaultValue={task?.title ?? ""} placeholder={`${activityLabel(activity)} — ${fields[0]?.code ?? "Field A"}`} />
            </Field>
            <Field label="Activity">
              <Select name="activityType" value={activity} onChange={(e) => setActivity(e.target.value as ActivityType)}>
                {Object.entries(ACTIVITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Field">
              <Select name="fieldId" defaultValue={task?.fieldId ?? ""}>
                <option value="">—</option>
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code} · {f.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assigned to">
              <Select name="workerId" defaultValue={task?.workerId ?? ""}>
                <option value="">Unassigned</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Starts">
                <TextInput name="startsAt" type="datetime-local" required defaultValue={toLocalInput(defaultStart)} />
              </Field>
              <Field label="Ends">
                <TextInput name="endsAt" type="datetime-local" defaultValue={toLocalInput(task?.endsAt)} />
              </Field>
            </div>
            <Field label="Notes" className="col-span-2">
              <TextArea name="notes" rows={2} defaultValue={task?.notes ?? ""} placeholder="Rate, wind limits, PPE, anything the crew should know" />
            </Field>
          </div>
          <DialogFooter className="mt-4 sm:justify-between">
            <div className="flex gap-2">
              {task ? (
                <>
                  <Button type="button" variant="outline" onClick={() => onToggleDone(task)}>
                    <Check data-icon="inline-start" /> {task.status === "done" ? "Mark planned" : "Mark done"}
                  </Button>
                  <Button type="button" variant="ghost" className="text-muted-foreground" onClick={remove}>
                    <Trash2 data-icon="inline-start" /> Delete
                  </Button>
                </>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : task ? "Save" : "Add task"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
