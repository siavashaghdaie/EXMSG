/**
 * Translation Service — powered by Anthropic Claude API.
 *
 * Uses the Anthropic Messages API directly (no SDK needed) with haiku
 * for fast, cost-effective translation. Claude excels at natural-sounding
 * translations and auto-detects source language.
 *
 * Environment variable:  ANTHROPIC_API_KEY
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001'; // fast + cheap for translation

/** Result for a single translated text */
export interface TranslationResult {
  translatedText: string;
  detectedSourceLanguage?: string;
}

/**
 * Translate one or more texts from `sourceLang` → `targetLang`.
 *
 * - If `sourceLang` is omitted, Claude auto-detects it.
 * - If the API key is missing, returns the original texts untouched.
 * - Batches all texts into a single API call for efficiency.
 */
export async function translateTexts(
  texts: string[],
  targetLang: string,
  sourceLang?: string,
): Promise<TranslationResult[]> {
  if (!ANTHROPIC_API_KEY) {
    console.warn('[Translation] ANTHROPIC_API_KEY not set — returning originals');
    return texts.map((t) => ({ translatedText: t }));
  }

  if (!texts.length || !targetLang) {
    return texts.map((t) => ({ translatedText: t }));
  }

  // Filter out empty strings
  const results: TranslationResult[] = [];
  const nonEmpty: { idx: number; text: string }[] = [];
  for (let i = 0; i < texts.length; i++) {
    if (texts[i].trim()) {
      nonEmpty.push({ idx: i, text: texts[i] });
    } else {
      results[i] = { translatedText: texts[i] };
    }
  }

  if (!nonEmpty.length) return results;

  // Build the prompt — single message for efficiency
  const sourceHint = sourceLang ? ` from ${sourceLang}` : '';

  // For a single text, use a simpler prompt
  if (nonEmpty.length === 1) {
    try {
      const resp = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2048,
          system: `You are a translation engine. Translate the user's text${sourceHint} to ${targetLang}. Output ONLY the translated text, nothing else. No explanations, no quotes, no prefixes. Detect the source language and include it as a single line at the very end in the format: [lang:XX] where XX is the ISO 639-1 code.`,
          messages: [{ role: 'user', content: nonEmpty[0].text }],
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error('[Translation] Anthropic API error:', resp.status, errText);
        results[nonEmpty[0].idx] = { translatedText: nonEmpty[0].text };
        return results;
      }

      const json = await resp.json() as {
        content: Array<{ type: string; text: string }>;
      };

      const rawOutput = json.content?.[0]?.text?.trim() || nonEmpty[0].text;
      const { text: translatedText, lang } = extractLangTag(rawOutput);

      results[nonEmpty[0].idx] = {
        translatedText,
        detectedSourceLanguage: lang || undefined,
      };
    } catch (err) {
      console.error('[Translation] fetch error:', err);
      results[nonEmpty[0].idx] = { translatedText: nonEmpty[0].text };
    }

    return results;
  }

  // Multiple texts — batch them
  // Format: numbered lines so Claude can return numbered translations
  const numberedTexts = nonEmpty.map((item, i) => `[${i + 1}] ${item.text}`).join('\n');

  try {
    const resp = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: `You are a translation engine. The user will give numbered messages${sourceHint}. Translate each to ${targetLang}. Output ONLY the translations in the same numbered format: [N] translated text. One per line. No explanations. At the very end, add a line: [lang:XX] with the detected source language ISO 639-1 code.`,
        messages: [{ role: 'user', content: numberedTexts }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('[Translation] Anthropic API error:', resp.status, errText);
      for (const item of nonEmpty) {
        results[item.idx] = { translatedText: item.text };
      }
      return results;
    }

    const json = await resp.json() as {
      content: Array<{ type: string; text: string }>;
    };

    const rawOutput = json.content?.[0]?.text?.trim() || '';
    const { text: cleanOutput, lang } = extractLangTag(rawOutput);

    // Parse numbered responses
    const lines = cleanOutput.split('\n');
    const translationMap = new Map<number, string>();

    for (const line of lines) {
      const match = line.match(/^\[(\d+)\]\s*(.+)$/);
      if (match) {
        translationMap.set(parseInt(match[1]), match[2].trim());
      }
    }

    for (let i = 0; i < nonEmpty.length; i++) {
      const translated = translationMap.get(i + 1);
      results[nonEmpty[i].idx] = {
        translatedText: translated || nonEmpty[i].text,
        detectedSourceLanguage: lang || undefined,
      };
    }
  } catch (err) {
    console.error('[Translation] fetch error:', err);
    for (const item of nonEmpty) {
      results[item.idx] = { translatedText: item.text };
    }
  }

  return results;
}

/**
 * Extract [lang:XX] tag from the end of Claude's output.
 */
function extractLangTag(output: string): { text: string; lang: string | null } {
  const langMatch = output.match(/\[lang:([a-zA-Z]{2,5})\]\s*$/);
  if (langMatch) {
    return {
      text: output.replace(/\[lang:[a-zA-Z]{2,5}\]\s*$/, '').trim(),
      lang: langMatch[1].toLowerCase(),
    };
  }
  return { text: output, lang: null };
}

/**
 * Convenience: translate a single string.
 */
export async function translateText(
  text: string,
  targetLang: string,
  sourceLang?: string,
): Promise<TranslationResult> {
  const [result] = await translateTexts([text], targetLang, sourceLang);
  return result;
}

/**
 * Detect the language of a text.
 */
export async function detectLanguage(text: string): Promise<string | null> {
  if (!ANTHROPIC_API_KEY || !text.trim()) return null;

  try {
    const resp = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 10,
        system: 'Detect the language of the user\'s text. Reply with ONLY the ISO 639-1 code (e.g. "en", "ar", "fa"). Nothing else.',
        messages: [{ role: 'user', content: text }],
      }),
    });

    if (!resp.ok) return null;

    const json = await resp.json() as {
      content: Array<{ type: string; text: string }>;
    };

    const code = json.content?.[0]?.text?.trim().toLowerCase();
    return code && code.length <= 5 ? code : null;
  } catch {
    return null;
  }
}

/**
 * Check if translation service is available (API key configured).
 */
export function isTranslationAvailable(): boolean {
  return !!ANTHROPIC_API_KEY;
}
