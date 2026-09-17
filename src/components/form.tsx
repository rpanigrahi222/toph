"use client";

import { cn } from "@/lib/utils";

/** Minimal labelled inputs shared by the Add/Edit dialogs. */

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1 text-[12px]", className)}>
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "h-9 w-full rounded-md border border-border bg-white px-2.5 text-[13px] outline-none focus:border-foreground/40 disabled:opacity-50";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputClass, "h-auto py-2", props.className)} />;
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(inputClass, props.className)}>
      {children}
    </select>
  );
}

/** Format a Date for <input type="datetime-local"> / "date" in local time. */
export function toLocalInput(d: Date | string | null | undefined, withTime = true) {
  if (!d) return "";
  const x = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  return withTime ? `${date}T${pad(x.getHours())}:${pad(x.getMinutes())}` : date;
}
