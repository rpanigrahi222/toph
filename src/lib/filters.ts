import { activityType, type ActivityType, type LogStatus } from "@/db/schema";
import type { LogFilters, LogSort } from "@/lib/queries";

/**
 * URL search params ⇄ LogFilters. The dashboard keeps its filter state in the
 * URL so views are shareable and the back button works.
 */
export function filtersFromSearchParams(sp: URLSearchParams | Record<string, string | string[] | undefined>): LogFilters {
  const get = (k: string): string | undefined => {
    if (sp instanceof URLSearchParams) return sp.get(k) ?? undefined;
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const status = get("status") as LogStatus | "all" | undefined;
  const sort = get("sort") as LogSort | undefined;
  const activity = get("activity");
  const from = get("from");
  const to = get("to");

  return {
    status: status && ["all", "new", "reviewed", "flagged"].includes(status) ? status : "new",
    thisMonth: get("month") !== "all",
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to + "T23:59:59") : undefined,
    q: get("q") || undefined,
    fieldId: get("field") || undefined,
    workerId: get("worker") || undefined,
    activity: activity && (activityType.enumValues as string[]).includes(activity) ? (activity as ActivityType) : undefined,
    sort: sort && ["date_desc", "date_asc", "employee", "confidence"].includes(sort) ? sort : "date_desc",
  };
}
