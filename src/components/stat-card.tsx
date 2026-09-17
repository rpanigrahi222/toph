import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  hintTone = "muted",
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  hintTone?: "muted" | "warn" | "good";
}) {
  return (
    <div className="rounded-xl border border-border bg-white px-5 py-4">
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <Icon className="size-4 text-foreground/80" strokeWidth={1.75} />
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-3">
        <div className="text-[34px] font-semibold leading-none tracking-tight">{value}</div>
        {hint ? (
          <div
            className={cn(
              "text-[11px]",
              hintTone === "muted" && "text-muted-foreground",
              hintTone === "warn" && "text-amber-600",
              hintTone === "good" && "text-emerald-600",
            )}
          >
            {hint}
          </div>
        ) : null}
      </div>
    </div>
  );
}
