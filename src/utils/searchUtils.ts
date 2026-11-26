export interface SafeGroundedSource {
  title: string;
  uri: string;
}

/**
 * Validates and sanitizes external URLs returned by search grounding chunks
 * so only safe http/https links can be rendered in anchor tags.
 */
export function sanitizeGroundedSources(
  chunks: Array<{ web?: { uri?: string; title?: string } }> | undefined
): SafeGroundedSource[] {
  if (!Array.isArray(chunks)) return [];
  const seen = new Set<string>();
  const results: SafeGroundedSource[] = [];

  for (const chunk of chunks) {
    const rawUri = chunk?.web?.uri?.trim();
    if (!rawUri) continue;

    let parsed: URL;
    try {
      parsed = new URL(rawUri);
    } catch {
      continue;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      continue;
    }

    const normalized = parsed.toString();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const rawTitle = chunk?.web?.title?.trim();
    results.push({
      title: rawTitle && rawTitle.length > 0 ? rawTitle : parsed.hostname,
      uri: normalized,
    });
  }

  return results;
}

/**
 * Extracts an optical/RF refractive index hint from grounded response text
 * when present (either via explicit marker `[N_INDEX: 1.519]` or standard notation `n ≈ 1.519`).
 */
export function extractRefractiveIndexFromText(text: string): number | null {
  if (!text) return null;

  const tagged = text.match(/\[N_INDEX\s*:\s*([0-9]+(?:\.[0-9]+)?)\]/i);
  if (tagged) {
    const val = Number(tagged[1]);
    if (Number.isFinite(val) && val >= 1.0 && val <= 4.0) {
      return Math.round(val * 10000) / 10000;
    }
  }

  const inline = text.match(/\bn\s*(?:=|≈|~|:)\s*([1-3](?:\.[0-9]{1,4}))\b/);
  if (inline) {
    const val = Number(inline[1]);
    if (Number.isFinite(val) && val >= 1.0 && val <= 4.0) {
      return Math.round(val * 10000) / 10000;
    }
  }

  return null;
}

/**
 * Strips the internal `[N_INDEX: ...]` extraction tag before rendering prose to users.
 */
export function stripInternalIndexTag(text: string): string {
  return text.replace(/\s*\[N_INDEX\s*:\s*[^\]]+\]\s*/gi, '').trim();
}
