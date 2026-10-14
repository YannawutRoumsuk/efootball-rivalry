/** Pure helpers for matching OCR'd on-screen names against names seen before. */

export interface KnownLabel {
  playerId: string;
  label: string;
  uses: number;
}

/** Lower-case, strip spaces and punctuation (OCR often inserts spaces between Thai glyphs). */
export function normalizeLabel(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s"'“”‘’|.,:;_\-()[\]{}]/g, "");
}

export function levenshtein(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= y.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length];
}

export interface LabelMatch {
  label: string;
  playerId: string;
}

/**
 * Picks the known label closest to any OCR candidate (exact, or one edit away
 * for names of 4+ characters). The most-used player for that label wins.
 */
export function matchKnownLabel(candidates: readonly string[], known: readonly KnownLabel[]): LabelMatch | null {
  let best: { m: LabelMatch; dist: number; uses: number } | null = null;
  for (const raw of candidates) {
    const c = normalizeLabel(raw);
    if (c.length < 2) continue;
    for (const k of known) {
      const n = normalizeLabel(k.label);
      const dist = c === n ? 0 : levenshtein(c, n);
      const allowed = Math.min([...n].length, [...c].length) >= 4 ? 1 : 0;
      if (dist > allowed) continue;
      if (!best || dist < best.dist || (dist === best.dist && k.uses > best.uses)) {
        best = { m: { label: k.label, playerId: k.playerId }, dist, uses: k.uses };
      }
    }
  }
  return best?.m ?? null;
}

export interface PlayerSuggestion {
  leftPlayer: string | null;
  rightPlayer: string | null;
}

/**
 * Turns label matches into a pre-selection for "who played on each side".
 * Only a suggestion — the uploader still confirms it. With two players, one
 * recognised side is enough to infer the other.
 */
export function suggestPlayers(
  left: LabelMatch | null,
  right: LabelMatch | null,
  rosterIds: readonly string[],
): PlayerSuggestion {
  let l = left?.playerId ?? null;
  let r = right?.playerId ?? null;
  if (l && r && l === r) return { leftPlayer: null, rightPlayer: null };
  if (rosterIds.length === 2) {
    if (l && !r) r = rosterIds.find((id) => id !== l) ?? null;
    if (r && !l) l = rosterIds.find((id) => id !== r) ?? null;
  }
  return { leftPlayer: l, rightPlayer: r };
}

/** A Latin-script OCR read we can trust as-is for a brand-new name. */
export function trustedLatinLabel(text: string, confidence: number): string | null {
  const t = text.trim().replace(/^["“'‘|]+|["”'’|]+$/g, "");
  return confidence >= 85 && /^[A-Za-z0-9][A-Za-z0-9 _.-]{1,19}$/.test(t) ? t : null;
}
