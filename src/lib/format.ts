import { format } from "date-fns";
import type { ActivityType } from "@/db/schema";

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  spraying: "Spraying",
  fertilizing: "Fertilizing",
  planting: "Planting",
  irrigating: "Irrigation",
  harvesting: "Harvesting",
  scouting: "Scouting",
  pruning: "Pruning",
  soil_work: "Soil Work",
  equipment_maintenance: "Equipment",
  other: "Other",
};

export function activityLabel(a: ActivityType | string) {
  return ACTIVITY_LABELS[a as ActivityType] ?? a;
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return format(new Date(d), "MMMM d, yyyy");
}

export function fmtTime(d: Date | string | null | undefined) {
  if (!d) return "";
  return format(new Date(d), "h:mm a");
}

export function fmtTimeRange(start: Date | string | null | undefined, end: Date | string | null | undefined) {
  if (!start) return "—";
  if (!end) return fmtTime(start);
  return `${fmtTime(start)} - ${fmtTime(end)}`;
}

export function fmtDuration(seconds: number | string | null | undefined) {
  if (seconds == null) return "";
  const s = Math.round(Number(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m}:${String(r).padStart(2, "0")}` : `0:${String(r).padStart(2, "0")}`;
}

/** Human label for a Deepgram / ISO 639-1 language code. */
export const LANGUAGES: { code: string; label: string; native: string }[] = [
  { code: "multi", label: "Auto-detect", native: "Auto" },
  { code: "en", label: "English", native: "English" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "fr", label: "French", native: "Français" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "pt", label: "Portuguese", native: "Português" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "ja", label: "Japanese", native: "日本語" },
  { code: "it", label: "Italian", native: "Italiano" },
  { code: "nl", label: "Dutch", native: "Nederlands" },
  { code: "ru", label: "Russian", native: "Русский" },
  { code: "zh", label: "Chinese", native: "中文" },
  { code: "ko", label: "Korean", native: "한국어" },
  { code: "vi", label: "Vietnamese", native: "Tiếng Việt" },
  { code: "tl", label: "Tagalog", native: "Tagalog" },
  { code: "ar", label: "Arabic", native: "العربية" },
];

export function languageLabel(code: string | null | undefined) {
  if (!code) return "—";
  return LANGUAGES.find((l) => l.code === code)?.label ?? code.toUpperCase();
}
