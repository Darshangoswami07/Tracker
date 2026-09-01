/**
 * Legacy no-op.
 *
 * This used to seed on-device SQLite lookup tables (companies / drivers /
 * staff) for offline GR pickers. SQLite has been removed — the pickers now
 * fetch live from the backend (`orderRepository.listCompanies/listDrivers/
 * listStaff`). Kept as an exported no-op so existing call sites keep working
 * without a screen change.
 */
export const syncLookupTables = async (_accessToken?: string | null): Promise<void> => {};
