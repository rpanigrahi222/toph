"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { AudioLines, ArrowUpDown, Calendar, Check, CloudOff, Download, ListFilter, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { activityLabel, fmtDate, fmtTimeRange, languageLabel, ACTIVITY_LABELS } from "@/lib/format";
import type { LogRow } from "@/lib/queries";
import type { Field, User } from "@/db/schema";
import { LogDetailPanel } from "./log-detail-panel";

type Props = {
  title: string;
  initial: { rows: LogRow[]; total: number };
  fields: Field[];
  workers: User[];
  /** Show the status filter (Activity Logs page). Dashboard is pinned to "new". */
  showStatus?: boolean;
};

const SORT_LABELS: Record<string, string> = {
  date_desc: "Newest first",
  date_asc: "Oldest first",
  employee: "Employee A–Z",
  confidence: "Lowest confidence",
};

export function LogsTable({ title, initial, fields, workers, showStatus }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const qs = sp.toString();

  const { data, isFetching } = useQuery({
    queryKey: ["logs", pathname, qs],
    queryFn: async () => {
      const params = new URLSearchParams(qs);
      // Dashboard is pinned to the "new" inbox; Activity Logs defaults to everything.
      if (!showStatus) params.set("status", "new");
      else if (!params.get("status")) params.set("status", "all");
      const res = await fetch(`/api/logs?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load logs");
      return (await res.json()) as { rows: LogRow[]; total: number };
    },
    initialData: initial,
    refetchInterval: 15_000, // keeps the dashboard live while a worker records
  });

  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [sp, router, pathname],
  );

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const monthOn = sp.get("month") !== "all";
  const dateOn = !!(sp.get("from") || sp.get("to"));
  const sort = sp.get("sort") ?? "date_desc";
  const filterCount = ["field", "worker", "activity", showStatus ? "status" : ""].filter((k) => k && sp.get(k)).length;

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleOne = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const bulkReview = async () => {
    const ids = [...selected];
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/logs/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "reviewed" }),
        }),
      ),
    );
    toast.success(`${ids.length} log${ids.length === 1 ? "" : "s"} marked reviewed`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["logs"] });
    router.refresh();
  };

  const exportCsv = () => {
    const chosen = rows.filter((r) => selected.size === 0 || selected.has(r.id));
    const header = ["Employee", "Activity", "Date", "Field", "Start", "End", "Status", "Confidence", "Language", "Summary"];
    const lines = chosen.map((r) =>
      [
        r.workerName,
        activityLabel(r.activityType),
        fmtDate(r.createdAt),
        r.fieldCode,
        r.startedAt ? new Date(r.startedAt).toLocaleTimeString() : "",
        r.endedAt ? new Date(r.endedAt).toLocaleTimeString() : "",
        r.status,
        r.confidence ?? "",
        languageLabel(r.languageDetected),
        r.summary ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `toph-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="rounded-xl border border-border bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2 text-[14px] font-medium">
          <AudioLines className="size-4" strokeWidth={1.75} />
          {title} <span className="font-normal text-muted-foreground">({total})</span>
          {isFetching ? <span className="ml-1 size-1.5 animate-pulse rounded-full bg-emerald-500" /> : null}
        </div>

        <div className="flex items-center gap-2">
          {/* Date */}
          <Popover>
            <PopoverTrigger
              render={
                <Chip active={dateOn} icon={dateOn ? X : Calendar} onIconClick={dateOn ? () => setParam({ from: null, to: null }) : undefined}>
                  Date
                </Chip>
              }
            />
            <PopoverContent align="end" className="w-64 p-3">
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <label className="flex flex-col gap-1">
                  <span className="text-muted-foreground">From</span>
                  <input
                    type="date"
                    defaultValue={sp.get("from") ?? ""}
                    onChange={(e) => setParam({ from: e.target.value || null, month: "all" })}
                    className="h-8 rounded-md border border-border px-2"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-muted-foreground">To</span>
                  <input
                    type="date"
                    defaultValue={sp.get("to") ?? ""}
                    onChange={(e) => setParam({ to: e.target.value || null, month: "all" })}
                    className="h-8 rounded-md border border-border px-2"
                  />
                </label>
              </div>
            </PopoverContent>
          </Popover>

          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Chip icon={ArrowUpDown}>Sort</Chip>} />
            <DropdownMenuContent align="end">
              {Object.entries(SORT_LABELS).map(([k, label]) => (
                <DropdownMenuItem key={k} onClick={() => setParam({ sort: k === "date_desc" ? null : k })}>
                  <span className="flex-1">{label}</span>
                  {sort === k ? <Check className="size-3.5" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* This month */}
          <Chip
            active={monthOn}
            icon={monthOn ? X : Calendar}
            onClick={() => setParam({ month: monthOn ? "all" : null })}
          >
            This Month{monthOn ? ` (${total})` : ""}
          </Chip>

          {/* Filter */}
          <Popover>
            <PopoverTrigger render={<Chip active={filterCount > 0} icon={ListFilter}>Filter{filterCount ? ` (${filterCount})` : ""}</Chip>} />
            <PopoverContent align="end" className="w-64 p-3">
              <div className="flex flex-col gap-2.5 text-[12px]">
                <FilterSelect
                  label="Field"
                  value={sp.get("field") ?? ""}
                  onChange={(v) => setParam({ field: v })}
                  options={fields.map((f) => [f.id, f.code])}
                />
                <FilterSelect
                  label="Employee"
                  value={sp.get("worker") ?? ""}
                  onChange={(v) => setParam({ worker: v })}
                  options={workers.map((w) => [w.id, w.name])}
                />
                <FilterSelect
                  label="Activity"
                  value={sp.get("activity") ?? ""}
                  onChange={(v) => setParam({ activity: v })}
                  options={Object.entries(ACTIVITY_LABELS)}
                />
                {showStatus ? (
                  <FilterSelect
                    label="Status"
                    value={sp.get("status") ?? ""}
                    onChange={(v) => setParam({ status: v })}
                    options={[
                      ["all", "All"],
                      ["new", "New & flagged"],
                      ["flagged", "Flagged only"],
                      ["reviewed", "Reviewed"],
                    ]}
                  />
                ) : null}
                {filterCount ? (
                  <button
                    className="self-start text-[12px] text-muted-foreground underline"
                    onClick={() => setParam({ field: null, worker: null, activity: null, status: null })}
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 ? (
        <div className="flex items-center gap-3 border-t border-border bg-muted/40 px-4 py-2 text-[12px]">
          <span className="font-medium">{selected.size} selected</span>
          <Button size="xs" variant="outline" onClick={bulkReview}>
            <Check data-icon="inline-start" /> Mark reviewed
          </Button>
          <Button size="xs" variant="outline" onClick={exportCsv}>
            <Download data-icon="inline-start" /> Export CSV
          </Button>
          <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      ) : null}

      {/* Table */}
      <table className="w-full table-fixed border-collapse text-[13px]">
        <colgroup>
          <col className="w-12" />
          <col className="w-[22%]" />
          <col className="w-[13%]" />
          <col className="w-[19%]" />
          <col className="w-[11%]" />
          <col />
          <col className="w-20" />
        </colgroup>
        <thead>
          <tr className="border-t border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
            </th>
            <th className="px-3 py-2.5 font-medium">Employee</th>
            <th className="px-3 py-2.5 font-medium">Activity</th>
            <th className="px-3 py-2.5 font-medium">Date</th>
            <th className="px-3 py-2.5 font-medium">Field</th>
            <th className="px-3 py-2.5 font-medium">Time</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-12 text-center text-[13px] text-muted-foreground">
                No logs match these filters.
              </td>
            </tr>
          ) : null}
          {rows.map((r) => {
            const open = expanded === r.id;
            return (
              <Row
                key={r.id}
                row={r}
                open={open}
                checked={selected.has(r.id)}
                onCheck={() => toggleOne(r.id)}
                onToggle={() => setExpanded(open ? null : r.id)}
              >
                {open ? (
                  <LogDetailPanel
                    id={r.id}
                    fields={fields}
                    onChanged={() => {
                      qc.invalidateQueries({ queryKey: ["logs"] });
                      router.refresh();
                    }}
                  />
                ) : null}
              </Row>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  row: r,
  open,
  checked,
  onCheck,
  onToggle,
  children,
}: {
  row: LogRow;
  open: boolean;
  checked: boolean;
  onCheck: () => void;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <>
      <tr
        className={cn(
          "cursor-pointer border-t border-border transition-colors hover:bg-muted/50",
          open && "bg-muted/50",
        )}
        onClick={onToggle}
      >
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={checked} onCheckedChange={onCheck} aria-label={`Select ${r.workerName}`} />
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            <span className="font-medium">{r.workerName}</span>
            {r.needsReview ? (
              <Tooltip>
                <TooltipTrigger render={<span className="size-2 rounded-full bg-amber-500" />} />
                <TooltipContent>Needs review</TooltipContent>
              </Tooltip>
            ) : null}
            {r.languageDetected && r.languageDetected !== "en" ? (
              <span className="rounded bg-sky-50 px-1.5 py-px text-[10px] font-medium uppercase text-sky-700">
                {r.languageDetected}
              </span>
            ) : null}
            {r.source === "offline" ? (
              <Tooltip>
                <TooltipTrigger render={<CloudOff className="size-3.5 text-muted-foreground" />} />
                <TooltipContent>Recorded offline, synced later</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-3">{activityLabel(r.activityType)}</td>
        <td className="whitespace-nowrap px-3 py-3">{fmtDate(r.createdAt)}</td>
        <td className="whitespace-nowrap px-3 py-3">{r.fieldCode}</td>
        <td className="whitespace-nowrap px-3 py-3">{fmtTimeRange(r.startedAt, r.endedAt)}</td>
        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="outline" className="rounded-full px-3" onClick={onToggle}>
            {open ? "Close" : "View"}
          </Button>
        </td>
      </tr>
      {open ? (
        <tr className="border-t border-border/60">
          <td colSpan={7} className="px-5 pb-6 pt-4">
            {children}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Chip({
  active,
  icon: Icon,
  children,
  onClick,
  onIconClick,
  ...rest
}: {
  active?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onClick?: () => void;
  onIconClick?: () => void;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors",
        active
          ? "border-foreground bg-foreground text-background hover:bg-foreground/90"
          : "border-border bg-white text-foreground hover:bg-muted",
        rest.className,
      )}
    >
      <span
        onClick={
          onIconClick
            ? (e) => {
                e.stopPropagation();
                e.preventDefault();
                onIconClick();
              }
            : undefined
        }
        className={cn("flex", onIconClick && "cursor-pointer")}
      >
        <Icon className="size-3.5" />
      </span>
      {children}
    </button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-border bg-white px-2 text-[12px]"
      >
        <option value="">Any</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
