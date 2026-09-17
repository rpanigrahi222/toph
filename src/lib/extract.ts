import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { activityType, type Field, type Product } from "@/db/schema";

// ---------------------------------------------------------------------------
// Output schema — this is the contract between the LLM and the database.
// ---------------------------------------------------------------------------

export const ExtractionSchema = z.object({
  activity_type: z.enum(activityType.enumValues),
  /** One of the farm's field codes (e.g. "FIELD A") or null if not stated. */
  field_code: z.string().nullable(),
  products: z.array(
    z.object({
      /** Product name as best matched to the farm's product list, else as spoken. */
      name: z.string(),
      rate: z.number().nullable(),
      unit: z.string().nullable(),
    }),
  ),
  /** Local start/end time as "HH:MM" (24h) if the worker stated one. */
  started_at_local: z.string().nullable(),
  ended_at_local: z.string().nullable(),
  /** ISO 639-1 code of the language actually spoken. */
  language_detected: z.string(),
  /** Faithful English translation of the transcript (verbatim if already English). */
  transcript_en: z.string(),
  /** 1–2 sentence English summary a farm manager can scan in the table. */
  summary_en: z.string(),
  /** 0–1: how confident you are that activity + field + products are correct. */
  confidence: z.number().min(0).max(1),
  needs_review: z.boolean(),
  review_reason: z.string().nullable(),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

export type ExtractionContext = {
  transcript: string;
  /** Language hint from the recorder UI ("multi" for auto-detect). */
  languageHint: string;
  recordedAt: Date;
  workerName: string;
  fields: Pick<Field, "code" | "name">[];
  products: Pick<Product, "name" | "type" | "activeIngredient" | "aliases">[];
};

// ---------------------------------------------------------------------------
// LLM extraction
// ---------------------------------------------------------------------------

function buildPrompt(ctx: ExtractionContext) {
  const fieldList = ctx.fields.map((f) => `- ${f.code} ("${f.name}")`).join("\n");
  const productList = ctx.products
    .map((p) => `- ${p.name} [${p.type}${p.activeIngredient ? `, ${p.activeIngredient}` : ""}]${p.aliases.length ? ` aka ${p.aliases.join(", ")}` : ""}`)
    .join("\n");

  return `You are the extraction step for Toph, a farm work-logging platform. A farm worker just recorded a voice log. Turn the transcript into a structured record for the farm manager's compliance dashboard.

Farm: Bays Ranch
Worker: ${ctx.workerName}
Recorded at (local): ${ctx.recordedAt.toISOString()}
Language hint from the recorder: ${ctx.languageHint === "multi" ? "auto-detect (may code-switch)" : ctx.languageHint}

Known fields (use the exact code, or null if the worker did not identify a field):
${fieldList}

Known products (match spoken names/brands/active ingredients to these where possible; keep the spoken name if no match):
${productList}

Rules:
- Translate faithfully to English in transcript_en. If already English, copy verbatim.
- summary_en is for a table cell: what was done, where, with what, in 1–2 sentences.
- Times: only fill started_at_local / ended_at_local if the worker actually says a time. Use 24h "HH:MM".
- Rates: normalise units to short forms (oz/ac, lb/ac, gal/ac, qt/ac, kg/ha, L/ha).
- confidence reflects whether activity, field and products are clearly stated. Off-topic, rambling, or contradictory answers get low confidence (< 0.5) and needs_review = true with a specific review_reason. Clear, complete logs get > 0.85.
- Never invent a field or product that was not stated or strongly implied.

Transcript:
"""
${ctx.transcript}
"""`;
}

export async function extractLog(ctx: ExtractionContext): Promise<{ extraction: Extraction; via: "claude" | "heuristic" }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { extraction: heuristicExtract(ctx), via: "heuristic" };
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "low",
        format: zodOutputFormat(ExtractionSchema),
      },
      messages: [{ role: "user", content: buildPrompt(ctx) }],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      console.warn("extraction: no parsed output", response.stop_reason);
      return { extraction: heuristicExtract(ctx), via: "heuristic" };
    }
    return { extraction: response.parsed_output, via: "claude" };
  } catch (err) {
    console.error("extraction failed, falling back to heuristic", err);
    return { extraction: heuristicExtract(ctx), via: "heuristic" };
  }
}

// ---------------------------------------------------------------------------
// Heuristic fallback — keeps the demo alive if the API key is missing or the
// request fails. Deliberately conservative: low confidence, flags for review.
// ---------------------------------------------------------------------------

const ACTIVITY_KEYWORDS: [RegExp, Extraction["activity_type"]][] = [
  [/\bspray|herbicide|pesticide|fungicide|insecticide|applied\b/i, "spraying"],
  [/\bfertiliz|urea|anhydrous|nitrogen|spread(er)?\b/i, "fertilizing"],
  [/\bplant|seed|drill|population\b/i, "planting"],
  [/\birrigat|pivot|water(ed|ing)\b/i, "irrigating"],
  [/\bharvest|combin|pick(ed|ing)\b/i, "harvesting"],
  [/\bscout|walk(ed)? the|check(ed)? the field|aphid|pest\b/i, "scouting"],
  [/\bprun|trim\b/i, "pruning"],
  [/\btill|cultivat|disc|plow|ripp\b/i, "soil_work"],
  [/\brepair|maintenance|oil change|fix(ed)?\b/i, "equipment_maintenance"],
];

export function heuristicExtract(ctx: ExtractionContext): Extraction {
  const t = ctx.transcript;
  const activity = ACTIVITY_KEYWORDS.find(([re]) => re.test(t))?.[1] ?? "other";

  let fieldCode: string | null = null;
  for (const f of ctx.fields) {
    const letter = f.code.replace(/^FIELD\s+/i, "");
    if (new RegExp(`\\bfield\\s+${letter}\\b`, "i").test(t) || new RegExp(`\\b${escapeRe(f.name)}\\b`, "i").test(t)) {
      fieldCode = f.code;
      break;
    }
  }

  const products: Extraction["products"] = [];
  for (const p of ctx.products) {
    const names = [p.name, p.activeIngredient, ...p.aliases].filter(Boolean) as string[];
    if (names.some((n) => new RegExp(`\\b${escapeRe(n)}\\b`, "i").test(t))) {
      products.push({ name: p.name, rate: null, unit: null });
    }
  }

  const stated = [activity !== "other", fieldCode != null].filter(Boolean).length;
  const confidence = stated === 2 ? 0.6 : stated === 1 ? 0.45 : 0.25;

  return {
    activity_type: activity,
    field_code: fieldCode,
    products,
    started_at_local: null,
    ended_at_local: null,
    language_detected: ctx.languageHint === "multi" ? "en" : ctx.languageHint,
    transcript_en: t,
    summary_en: t.length > 160 ? t.slice(0, 157) + "…" : t,
    confidence,
    needs_review: true,
    review_reason: "Processed without LLM extraction (ANTHROPIC_API_KEY not set). Please verify activity, field and products.",
  };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
