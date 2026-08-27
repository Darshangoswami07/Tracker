/** Fixed operational areas for GR import and staff access control. */
export const AREAS = ['Bageshwar', 'Almora', 'Garur Someshwar'] as const;

export type Area = (typeof AREAS)[number];
