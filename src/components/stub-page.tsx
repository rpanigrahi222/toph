import { Construction } from "lucide-react";

/** Honest placeholder for sidebar sections outside the interview scope. */
export function StubPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex max-w-xl flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-white px-6 py-8">
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <Construction className="size-4 text-muted-foreground" /> Not built yet
      </div>
      <p className="text-[13px] leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
