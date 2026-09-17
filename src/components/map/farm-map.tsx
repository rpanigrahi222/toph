"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { FieldMapLazy } from "./field-map-lazy";
import { cn } from "@/lib/utils";

export type FarmMapField = {
  id: string;
  code: string;
  name: string;
  acres: number | null;
  geometry: GeoJSON.Polygon;
  centroidLat: number;
  centroidLng: number;
  lastSpray: { productName: string; appliedAt: string | null; reiHours: number | null; workerName: string | null } | null;
  reiExpires: string | null;
};

/**
 * Map page: fields coloured by restricted-entry-interval status, with a
 * side panel listing each field's last application and a live countdown.
 */
export function FarmMap({ fields }: { fields: FarmMapField[] }) {
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const rows = useMemo(
    () =>
      fields.map((f) => {
        const exp = f.reiExpires ? new Date(f.reiExpires).getTime() : null;
        const remainingMs = exp ? exp - now : 0;
        return { ...f, reiActive: remainingMs > 0, remainingMs };
      }),
    [fields, now],
  );

  const mapFields = rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    geometry: r.geometry,
    centroidLat: r.centroidLat,
    centroidLng: r.centroidLng,
    highlighted: r.id === selected,
    reiActive: r.reiActive,
    label: r.reiActive ? `re-entry in ${fmtRemaining(r.remainingMs)}` : undefined,
  }));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <div className="h-[50vh] min-h-[320px] overflow-hidden rounded-xl border border-border lg:h-[calc(100vh-140px)] lg:min-h-[420px]">
        <FieldMapLazy fields={mapFields} focusCode={selected ? rows.find((r) => r.id === selected)?.code : undefined} onSelect={(f) => setSelected(f.id)} />
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelected(r.id === selected ? null : r.id)}
            className={cn(
              "rounded-xl border bg-white px-4 py-3 text-left transition-colors hover:bg-muted/40",
              r.id === selected ? "border-foreground" : "border-border",
            )}
          >
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold">
                {r.code} <span className="font-normal text-muted-foreground">· {r.name}</span>
              </div>
              {r.reiActive ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                  <ShieldAlert className="size-3" /> REI
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  <ShieldCheck className="size-3" /> Clear
                </span>
              )}
            </div>
            <div className="mt-1 text-[12px] text-muted-foreground">
              {r.acres ? `${r.acres} ac` : ""}
              {r.lastSpray ? (
                <>
                  {r.acres ? " · " : ""}
                  Last: {r.lastSpray.productName}
                  {r.lastSpray.appliedAt ? ` on ${new Date(r.lastSpray.appliedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
                  {r.lastSpray.workerName ? ` by ${r.lastSpray.workerName}` : ""}
                </>
              ) : (
                <>{r.acres ? " · " : ""}No chemical applications in the last 7 days</>
              )}
            </div>
            {r.reiActive ? (
              <div className="mt-1.5 text-[12px] font-medium text-red-700">
                Re-entry allowed in {fmtRemaining(r.remainingMs)} ({r.lastSpray?.reiHours}h REI)
              </div>
            ) : null}
            <Link
              href={`/logs?field=${r.id}&month=all&status=all`}
              onClick={(e) => e.stopPropagation()}
              className="mt-2 inline-block text-[12px] text-muted-foreground underline-offset-2 hover:underline"
            >
              View logs →
            </Link>
          </button>
        ))}
        <p className="px-1 pt-1 text-[11px] text-muted-foreground">
          REI = restricted-entry interval from the product label. Workers may not enter a treated field until it expires without PPE.
        </p>
      </div>
    </div>
  );
}

function fmtRemaining(ms: number) {
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return h ? `${h}h ${m}m` : `${m}m`;
}
