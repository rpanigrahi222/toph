import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { languageLabel } from "@/lib/format";

const TranslationSchema = z.object({
  /** ISO 639-1 code of the language the input was actually written in. */
  source_language: z.string(),
  /** The translation, or the input verbatim if it was already in the target language. */
  translation: z.string(),
});

export type Translation = z.infer<typeof TranslationSchema> & { via: "claude" | "none" };

/**
 * Translate a short farm message into `targetLanguage` (ISO 639-1). Keeps
 * product names, field codes, numbers and units intact. Returns the input
 * unchanged if no API key is configured or the call fails — a message in the
 * wrong language is better than a lost message.
 */
export async function translateMessage(text: string, targetLanguage: string, sourceHint?: string): Promise<Translation> {
  const target = targetLanguage === "multi" ? "en" : targetLanguage;
  if (!process.env.ANTHROPIC_API_KEY || !text.trim()) {
    return { source_language: sourceHint ?? "en", translation: text, via: "none" };
  }

  try {
    const client = new Anthropic();
    const res = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: zodOutputFormat(TranslationSchema) },
      messages: [
        {
          role: "user",
          content: `Translate this farm-operations message into ${languageLabel(target)} (${target}). It is a message between a farm office and a field worker.
Keep product/brand names (e.g. Roundup, Atrazine 4L), field codes (e.g. FIELD B), numbers and units exactly as written. Use plain, friendly, spoken register — the reader may have limited literacy. Do not add anything.
${sourceHint && sourceHint !== "multi" ? `The message is probably written in ${languageLabel(sourceHint)}.` : ""}

Message:
"""
${text}
"""`,
        },
      ],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) {
      return { source_language: sourceHint ?? "en", translation: text, via: "none" };
    }
    return { ...res.parsed_output, via: "claude" };
  } catch (err) {
    console.error("translate failed", err);
    return { source_language: sourceHint ?? "en", translation: text, via: "none" };
  }
}
