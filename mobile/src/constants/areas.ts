/** Fixed operational areas for GR import and staff access control. */
export const AREAS = ['Bageshwar', 'Almora', 'Garur Someshwar'] as const;

export type Area = (typeof AREAS)[number];

const normalizeAreaText = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

const AREA_LOOKUP: Record<string, Area> = AREAS.reduce((acc, area) => {
  acc[normalizeAreaText(area)] = area;
  return acc;
}, {} as Record<string, Area>);

/**
 * Matches free text (e.g. an Excel row's Consignee Name) against the fixed
 * area list, tolerant of case and surrounding/duplicate whitespace
 * differences ("bageshwar", "BAGESHWAR", " Garur   Someshwar " all resolve
 * to their canonical `Area`). Returns null when the text doesn't correspond
 * to a known area — callers should leave the GR's area unassigned rather
 * than guess.
 */
export const matchArea = (text: string | null | undefined): Area | null => {
  if (!text) return null;
  return AREA_LOOKUP[normalizeAreaText(text)] ?? null;
};
