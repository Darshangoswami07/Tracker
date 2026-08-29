/** Fixed operational areas for GR import and staff access control. */
export const AREAS = ['Bageshwar', 'Almora', 'Garur Someshwar'] as const;

export type Area = (typeof AREAS)[number];

const normalizeAreaText = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

const AREA_LOOKUP: Record<string, Area> = AREAS.reduce((acc, area) => {
  acc[normalizeAreaText(area)] = area;
  return acc;
}, {} as Record<string, Area>);

/** Levenshtein edit distance, capped — real transport-slip data has
 * spelling variants ("Bageshawar" for "Bageshwar") that an exact match
 * would silently miss and fall through to whatever fallback area was
 * picked for the import, mis-bucketing the GR. Capped at 2 substitutions/
 * insertions/deletions so it stays a tolerance for typos, not a fuzzy
 * "close enough" matcher that could confuse two different real area names. */
const editDistanceWithinCap = (a: string, b: string, cap: number): boolean => {
  if (Math.abs(a.length - b.length) > cap) return false;
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length] <= cap;
};

/**
 * Matches free text (e.g. an Excel row's Consignee Name or To Location)
 * against the fixed area list, tolerant of case and surrounding/duplicate
 * whitespace differences ("bageshwar", "BAGESHWAR", " Garur   Someshwar "
 * all resolve to their canonical `Area`), and tolerant of small spelling
 * variants (edit distance <= 2, e.g. "Bageshawar" -> "Bageshwar") since
 * real hill-town transport data isn't always spelled consistently. Returns
 * null when nothing is close enough — callers should leave the GR's area
 * unassigned rather than guess between two genuinely different areas.
 */
export const matchArea = (text: string | null | undefined): Area | null => {
  if (!text) return null;
  const normalized = normalizeAreaText(text);
  const exact = AREA_LOOKUP[normalized];
  if (exact) return exact;
  for (const area of AREAS) {
    if (editDistanceWithinCap(normalized, normalizeAreaText(area), 2)) return area;
  }
  return null;
};
