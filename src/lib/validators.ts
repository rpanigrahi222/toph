import { z } from "zod";
import { activityType } from "@/db/schema";

const optionalText = (max: number) => z.string().max(max).optional().nullable();
const optionalUuid = z.string().uuid().optional().nullable();

export const AuditInput = z.object({
  title: z.string().min(1).max(120),
  agency: optionalText(120),
  scheduledFor: z.coerce.date(),
  status: z.enum(["scheduled", "in_progress", "passed", "findings"]).optional(),
  scope: optionalText(2000),
  fieldId: optionalUuid,
  findings: optionalText(5000),
});
export const AuditPatch = AuditInput.partial();

export const ReportInput = z.object({
  title: z.string().min(1).max(120),
  type: z.enum(["pesticide_use", "fertilizer", "field_activity", "custom"]),
  /** Extra keywords typed by the user; preset keywords are added server-side. */
  keywords: z.array(z.string().max(60)).max(50).default([]),
  fieldId: optionalUuid,
  fromDate: z.coerce.date().optional().nullable(),
  toDate: z.coerce.date().optional().nullable(),
  notes: optionalText(2000),
});

export const TaskInput = z.object({
  title: z.string().min(1).max(120),
  activityType: z.enum(activityType.enumValues).optional(),
  fieldId: optionalUuid,
  workerId: optionalUuid,
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional().nullable(),
  status: z.enum(["planned", "done", "cancelled"]).optional(),
  notes: optionalText(2000),
});
export const TaskPatch = TaskInput.partial();
