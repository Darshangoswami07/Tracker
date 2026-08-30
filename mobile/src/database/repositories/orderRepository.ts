import { ensureDatabaseReady, getDatabase } from '../database';
import { uuid } from '../../utils/uuid';
import { useUserStore } from '../../store/userStore';

/**
 * Location-based access control (see the "Staff Login Must Be Restricted to
 * Their Assigned Location" requirement). GR/payment data is local-first
 * SQLite queried in-process — there is no backend GR API for mobile to
 * enforce at, so this repository (the single choke point every screen reads
 * and writes through) is the actual security boundary: it is enforced here,
 * not left to each screen to compute correctly, so a modified/buggy screen
 * can never widen a Staff account's access by passing a different `area` or
 * `orderId`.
 *
 * Only the `staff` role (the self-service portal) is scoped this way — Admin
 * (and the older `employee` role) are never restricted.
 */

/** Matches no real row — used to fail CLOSED (see nothing) rather than
 * silently falling back to "no filter" (see everything) if a Staff account
 * somehow has no assigned area (should not happen once registration
 * requires one, but a pre-existing/rejected/edge-case row is possible). */
const STAFF_NO_AREA_SENTINEL = '__no_area_assigned__';

/** Resolves the area a query is actually allowed to run against. For a Staff
 * user this ALWAYS returns their own assigned area — the caller-supplied
 * `requestedArea` is ignored entirely, so no screen can widen a Staff
 * account's results by passing (or mis-computing) a different value.
 * Non-Staff callers (Admin/Owner/Super Admin/legacy `employee`) pass through
 * unchanged, undefined meaning "no area filter" as before. */
const resolveAreaScope = (requestedArea?: string): string | undefined => {
  const user = useUserStore.getState().user;
  if (user?.role === 'staff') return user.area ?? STAFF_NO_AREA_SENTINEL;
  return requestedArea;
};

/** Synchronous version of the same check for a row already in hand (avoids a
 * second DB round-trip in `getById`/`getByOrderNumber`, which already have
 * the row). Non-Staff callers always pass. */
const orderRowInStaffScope = (row: { area?: string | null }): boolean => {
  const user = useUserStore.getState().user;
  if (user?.role !== 'staff') return true;
  const scoped = user.area ?? STAFF_NO_AREA_SENTINEL;
  return (row.area ?? null) === scoped;
};

/** For Staff Daily Work queries: a Staff user can only ever query their own
 * id, regardless of what `requestedStaffId` a (currently Admin-only, but
 * potentially future Staff-facing) screen passes. Non-Staff pass through. */
const resolveStaffScope = (requestedStaffId: string): string => {
  const user = useUserStore.getState().user;
  if (user?.role === 'staff') return user.id;
  return requestedStaffId;
};

/** Throws if the signed-in user is Staff and the given order does not belong
 * to their assigned area — call before any read/write that takes a raw
 * `orderId`, so a Staff account can never reach another location's GR by
 * guessing/pasting its id, regardless of which screen or param got them
 * there. No-op for non-Staff roles. */
const assertStaffOrderAccess = async (orderId: string): Promise<void> => {
  const user = useUserStore.getState().user;
  if (user?.role !== 'staff') return;
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ area: string | null }>('SELECT area FROM orders WHERE id = ?', [orderId]);
  const scoped = user.area ?? STAFF_NO_AREA_SENTINEL;
  if (!row || row.area !== scoped) {
    throw new Error('This GR does not belong to your assigned location.');
  }
};

/**
 * The single place that decides "is this GR fully paid, and if so is its
 * status caught up with that fact." A GR counts as fully paid when there is
 * nothing left to collect: either `toPay` is 0/unset (nothing was ever owed)
 * or the `payments` ledger sum has reached `toPay`. Whenever that's true and
 * the order isn't already `delivered`, it's flipped there and a status-
 * history row is appended — the same rule `addPayment` already enforced,
 * now also applied wherever else `toPay` or the payment total can change:
 * creating a GR (manual entry with toPay already 0, or an initial paid
 * amount), editing one (Edit GR can lower `toPay` to/under what's already
 * paid), and Excel import (a row's own Paid_Amt can already cover its
 * To Pay). Without this, a GR could sit "Pending" forever despite having
 * nothing outstanding, simply because it was never created/edited through
 * the Receive Payment flow. Never downgrades a GR away from `delivered` —
 * only ever raises status toward it.
 */
export const reconcileDeliveredStatus = async (
  db: Awaited<ReturnType<typeof getDatabase>>,
  orderId: string
): Promise<void> => {
  const order = await db.getFirstAsync<{ toPay: number | null; paymentAmount: number | null; status: string }>(
    'SELECT toPay, paymentAmount, status FROM orders WHERE id = ?',
    [orderId]
  );
  if (!order || order.status === 'delivered') return;

  const toPay = Number(order.toPay ?? 0);
  const ledgerPaid = Number(
    (await db.getFirstAsync<{ total: number }>(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE orderId = ?',
      [orderId]
    ))?.total ?? 0
  );
  // Legacy single-field amount (pre-ledger GRs, or one just set directly via
  // Edit GR / Excel import before any ledger row exists) counts too — the
  // ledger sum will be 0 for those, so this is never double-counted once a
  // ledger row exists (the v9->v10 migration already backfilled it once).
  const totalPaid = Math.max(ledgerPaid, Number(order.paymentAmount ?? 0));

  const fullyPaid = toPay <= 0 || totalPaid >= toPay - 0.005;
  if (!fullyPaid) return;

  const updatedAt = nowIso();
  await db.runAsync('UPDATE orders SET status = ?, updatedAt = ? WHERE id = ?', ['delivered', updatedAt, orderId]);
  await db.runAsync(
    'INSERT INTO order_status_history (id, orderId, status, note, createdAt) VALUES (?, ?, ?, ?, ?)',
    [uuid(), orderId, 'delivered', 'Auto-marked delivered: nothing outstanding', updatedAt]
  );
};

/** Mirrors `GRListItem` in `AdminGRShipmentsScreen` / web `admin/src/types/gr.ts`. */
export interface LocalGRListItem {
  id: string;
  orderNumber: string;
  consignorName: string | null;
  consigneeName: string | null;
  pickupAddress: string;
  deliveryAddress: string;
  driverId: string | null;
  assignedStaffId: string | null;
  status: string;
  createdAt: string;
  hasSlip: boolean;
  /** How this GR was created: 'manual' | 'slip' | 'excel'. Drives the GR
   * list's subtle origin indicator ("Excel imported" vs "Slip uploaded"). */
  source: string;
  /** Area assignment — e.g. "Bageshwar", "Almora", "Garur Someshwar". Null when imported before
   * the area system was added or for manually created GRs. */
  area: string | null;
  /** Amount to be collected on this GR (0 for delivery-type GRs). */
  toPay: number;
  /** Amount already collected against this GR. */
  paymentAmount: number;
}

/** Mirrors `GRAttachment` in `AdminGRDetailsScreen`. */
export interface LocalAttachment {
  id: string;
  originalFilename: string;
  mimeType: string;
  createdAt: string;
  url: string;
}

/** A single status transition, appended by `create`/`updateStatus`. */
export interface LocalTimelineEvent {
  id: string;
  status: string;
  note: string | null;
  createdAt: string;
}

/** Extended GR/slip fields — structured business information read off a
 * transport slip beyond the original 10-field GR form. Mirrors the same
 * additions in `backend/app/models/order.py`. All optional: a GR can always
 * be created/edited without them. */
export interface GRExtendedFields {
  grDate?: string;
  transportCompanyName?: string;
  transportGstin?: string;
  ewbNumber?: string;
  billType?: string;
  specialService?: string;
  fromLocation?: string;
  toLocation?: string;
  deliveryAt?: string;
  rate?: number;
  goodsValue?: number;
  grCharge?: number;
  freight?: number;
  labour?: number;
  pf?: number;
  doorDelivery?: number;
  taxGst?: number;
  netAmount?: number;
  toPay?: number;
  proprietorName?: string;
  proprietorPhone?: string;
  packageType?: string;
  consignorGstin?: string;
  consignorPhone?: string;
  consigneeGstin?: string;
  consigneePhone?: string;
  /** Excel bulk-import fields — mirrors the same additions in `schema.ts`'s
   * v6 migration. All optional: only present on Excel-imported GRs (or a
   * manually-entered GR where the Admin fills them in). */
  chalaanNo?: string;
  chalaanDate?: string;
  transportGrn?: string;
  paymentMode?: string;
  grSourceLabel?: string;
}

const EXTENDED_FIELD_KEYS: (keyof GRExtendedFields)[] = [
  'grDate', 'transportCompanyName', 'transportGstin', 'ewbNumber', 'billType',
  'specialService', 'fromLocation', 'toLocation', 'deliveryAt', 'rate',
  'goodsValue', 'grCharge', 'freight', 'labour', 'pf', 'doorDelivery',
  'taxGst', 'netAmount', 'toPay', 'proprietorName', 'proprietorPhone', 'packageType',
  'consignorGstin', 'consignorPhone', 'consigneeGstin', 'consigneePhone',
  'chalaanNo', 'chalaanDate', 'transportGrn', 'paymentMode', 'grSourceLabel',
];

/** Mirrors `GRDetail` in `AdminGRDetailsScreen` / web `admin/src/types/gr.ts`. */
export interface LocalGRDetail extends GRExtendedFields {
  id: string;
  orderNumber: string;
  status: string;
  trackingCode: string | null;
  pickupAddress: string;
  deliveryAddress: string;
  consignorName: string | null;
  consigneeName: string | null;
  particulars: string | null;
  packageCount: number | null;
  weight: number | null;
  notes: string | null;
  driverId: string | null;
  assignedStaffId: string | null;
  createdAt: string;
  /** Paid amount (`paymentAmount` column — pre-existing, previously unexposed
   * here). Excel's `Paid_Amt` maps onto this same column. */
  paymentAmount: number | null;
  slipData: Record<string, unknown> | null;
  attachments: LocalAttachment[];
  timeline: LocalTimelineEvent[];
  source: string;
  area: string | null;
}

export interface GRCreateInput extends GRExtendedFields {
  grNumber: string;
  companyId?: string;
  consignorName: string;
  consigneeName: string;
  pickupAddress: string;
  deliveryAddress: string;
  pickupTime: string;
  particulars?: string;
  packageCount?: number;
  weight?: number;
  trackingCode?: string;
  notes?: string;
  /** OCR-extracted slip snapshot (JSON string) persisted alongside the GR. */
  slipData?: string;
  /** 'manual' | 'slip' | 'excel'. Defaults to 'manual' when omitted (the
   * existing Create GR / OCR-review flows never pass this explicitly). */
  source?: string;
}

export interface GRUpdateInput extends GRExtendedFields {
  consignorName?: string;
  consigneeName?: string;
  particulars?: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  pickupTime?: string;
  packageCount?: number;
  weight?: number;
  notes?: string;
  /** Paid amount (`paymentAmount` column) — pre-existing column, previously
   * not editable anywhere. Excel's `Paid_Amt` maps onto this same column. */
  paymentAmount?: number;
}

/** Per-shop aggregate for the "All Shops" list — one row per fixed area
 * (see `constants/areas.ts`), covering only active (non-deleted) GRs. */
export interface ShopSummary {
  area: string;
  total: number;
  pending: number;
  cleared: number;
  uncleared: number;
  delivered: number;
  totalToPay: number;
  totalCollected: number;
  outstanding: number;
}

/** A single shop (consignor) and its live active-GR count, for the Staff
 * "All Shops" list. Scoped to the signed-in Staff member's own assigned area
 * at the repository level (see `getShopsWithCounts`). */
export interface ShopCount {
  name: string;
  grCount: number;
}

/** One GR a staff member collected a payment on, for a given day —
 * see `orderRepository.getStaffDailyGRs`. */
export interface StaffDailyGR {
  orderId: string;
  orderNumber: string;
  consignorName: string | null;
  consigneeName: string | null;
  status: string;
  amountCollected: number;
}

export interface GRListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
  area?: string;
  /** Filter by exact consignor (shop owner) name. */
  consignor?: string;
  /** Inclusive lower bound on `createdAt` (ISO string) — drives the GR
   * list's "Date Range" filter (Today/This Week/This Month). */
  dateFrom?: string;
}

export interface GRListResult {
  items: LocalGRListItem[];
  total: number;
}

export interface PickerRow {
  id: string;
  name: string;
}

/** A single real GR/shipment event, sourced from `order_status_history` /
 * `order_attachments` — the same tables that already back the Customer
 * Tracking timeline and GR detail attachments list. */
export interface ActivityEvent {
  id: string;
  kind: 'created' | 'status' | 'upload';
  orderId: string;
  orderNumber: string;
  status?: string;
  previousStatus?: string | null;
  createdAt: string;
}

/** A single payment record against a GR/Order. */
export interface LocalPayment {
  id: string;
  orderId: string;
  amount: number;
  paymentMethod: string | null;
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
}

/** A single GR enriched with payment data for the Receiving Details list. */
export interface ReceivingListItem {
  id: string;
  orderNumber: string;
  consigneeName: string | null;
  consignorName: string | null;
  pickupAddress: string;
  deliveryAddress: string;
  grStatus: string;
  toPay: number;
  totalPaid: number;
  balance: number;
  paymentStatus: string; // 'unpaid' | 'partial' | 'paid' | 'overpaid'
  paymentCount: number;
  createdAt: string;
}

/** Aggregate payment overview across all GRs for the Receiving Details summary. */
export interface ReceivingOverview {
  totalToPay: number;
  totalPaid: number;
  outstanding: number;
  totalTransactions: number;
  unpaidCount: number;
  partialCount: number;
  paidCount: number;
  overpaidCount: number;
  grCount: number;
}

/** Aggregated payment summary for an order. */
export interface PaymentSummary {
  orderId: string;
  orderNumber: string;
  toPay: number;
  totalPaid: number;
  balance: number;
  paymentStatus: string; // "unpaid" | "partial" | "paid" | "overpaid"
  paymentCount: number;
  payments: LocalPayment[];
}

/** RFC-4122 v4 UUID without external deps (screens pass ids around as text). */
const nowIso = (): string => new Date().toISOString();

const rowToListItem = (row: any): LocalGRListItem => ({
  id: row.id,
  orderNumber: row.orderNumber,
  consignorName: row.consignorName ?? null,
  consigneeName: row.consigneeName ?? null,
  pickupAddress: row.pickupAddress,
  deliveryAddress: row.deliveryAddress,
  driverId: row.driverId ?? null,
  assignedStaffId: row.assignedStaffId ?? null,
  status: row.status,
  createdAt: row.createdAt,
  hasSlip: Boolean(row.hasSlip),
  source: row.source ?? 'manual',
  area: row.area ?? null,
  toPay: Number(row.toPay ?? 0),
  paymentAmount: Number(row.paymentAmount ?? 0),
});

/** Picks the extended-field columns off a raw SQLite row, converting `null`
 * (SQLite's absence marker) to `undefined` so they match `GRExtendedFields`'s
 * optional-field shape. */
const rowToExtendedFields = (row: any): GRExtendedFields => {
  const result: GRExtendedFields = {};
  for (const key of EXTENDED_FIELD_KEYS) {
    const value = row[key];
    if (value !== null && value !== undefined) (result as any)[key] = value;
  }
  return result;
};

const rowToDetail = (row: any): LocalGRDetail => ({
  id: row.id,
  orderNumber: row.orderNumber,
  status: row.status,
  trackingCode: row.trackingCode ?? null,
  pickupAddress: row.pickupAddress,
  deliveryAddress: row.deliveryAddress,
  consignorName: row.consignorName ?? null,
  consigneeName: row.consigneeName ?? null,
  particulars: row.particulars ?? null,
  packageCount: row.packageCount ?? null,
  weight: row.weight ?? null,
  notes: row.notes ?? null,
  driverId: row.driverId ?? null,
  assignedStaffId: row.assignedStaffId ?? null,
  createdAt: row.createdAt,
  paymentAmount: row.paymentAmount ?? null,
  slipData: parseSlipData(row.slipData),
  attachments: [],
  timeline: [],
  source: row.source ?? 'manual',
  area: row.area ?? null,
  ...rowToExtendedFields(row),
});

const parseSlipData = (value: string | null | undefined): Record<string, unknown> | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const rowToAttachment = (row: any): LocalAttachment => ({
  id: row.id,
  originalFilename: row.originalFilename,
  mimeType: row.mimeType,
  createdAt: row.createdAt,
  url: row.remoteUrl ?? row.localUri ?? '',
});

const rowToTimelineEvent = (row: any): LocalTimelineEvent => ({
  id: row.id,
  status: row.status,
  note: row.note ?? null,
  createdAt: row.createdAt,
});

export const orderRepository = {
  /**
   * Paginated GR list with optional status filter and free-text search over
   * GR number, consignor and consignee. Equivalent of `GET /admin/orders`.
   */
  async list(params: GRListParams = {}): Promise<GRListResult> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const clauses: string[] = ['isDeleted = 0'];
    const bind: (string | number)[] = [];

    if (params.status) {
      clauses.push('status = ?');
      bind.push(params.status);
    }
    if (params.search) {
      clauses.push('(orderNumber LIKE ? OR consignorName LIKE ? OR consigneeName LIKE ?)');
      const like = `%${params.search}%`;
      bind.push(like, like, like);
    }
    const scopedArea = resolveAreaScope(params.area);
    if (scopedArea) {
      clauses.push('area = ?');
      bind.push(scopedArea);
    }
    if (params.consignor) {
      clauses.push('consignorName = ?');
      bind.push(params.consignor);
    }
    if (params.dateFrom) {
      clauses.push('createdAt >= ?');
      bind.push(params.dateFrom);
    }

    const where = `WHERE ${clauses.join(' AND ')}`;

    const countRow = await db.getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) AS total FROM orders ${where}`,
      bind
    );

    const rows = await db.getAllAsync<any>(
      `SELECT * FROM orders ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      [...bind, pageSize, (page - 1) * pageSize]
    );

    return { items: rows.map(rowToListItem), total: countRow?.total ?? 0 };
  },

  /**
   * Returns sorted unique consignor (shop owner) names from active GRs,
   * optionally scoped by area. Used to populate the shop-owner filter
   * dropdown without loading every GR row.
   */
  async getDistinctConsignors(area?: string): Promise<string[]> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    const clauses: string[] = ['isDeleted = 0', 'consignorName IS NOT NULL', "consignorName != ''"];
    const bind: string[] = [];
    const scopedArea = resolveAreaScope(area);
    if (scopedArea) {
      clauses.push('area = ?');
      bind.push(scopedArea);
    }
    const rows = await db.getAllAsync<{ consignorName: string }>(
      `SELECT DISTINCT consignorName FROM orders WHERE ${clauses.join(' AND ')} ORDER BY consignorName ASC`,
      bind
    );
    return rows.map((r) => r.consignorName);
  },

  /** Full GR record including its attachments and status timeline.
   * Equivalent of `GET /admin/orders/{id}`. */
  async getById(id: string): Promise<LocalGRDetail | null> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    const row = await db.getFirstAsync<any>('SELECT * FROM orders WHERE id = ? AND isDeleted = 0', id);
    if (!row) return null;
    if (!orderRowInStaffScope(row)) return null;
    return this.hydrateDetail(row);
  },

  /** Looks a GR up by its human-readable GR number rather than internal id —
   * what Customer Tracking / GR Tracker (Classic) search on. GR data is
   * local-first (never synced to the backend), so this reads the on-device
   * SQLite database directly instead of calling `GET /orders/track/{gr}`. */
  async getByOrderNumber(orderNumber: string): Promise<LocalGRDetail | null> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    const row = await db.getFirstAsync<any>(
      'SELECT * FROM orders WHERE orderNumber = ? AND isDeleted = 0',
      orderNumber
    );
    if (!row) return null;
    if (!orderRowInStaffScope(row)) return null;
    return this.hydrateDetail(row);
  },

  /** Attaches attachments + status timeline to a raw `orders` row. */
  async hydrateDetail(row: any): Promise<LocalGRDetail> {
    const db = await getDatabase();
    const [attachments, timeline] = await Promise.all([
      db.getAllAsync<any>('SELECT * FROM order_attachments WHERE orderId = ? ORDER BY createdAt ASC', row.id),
      db.getAllAsync<any>('SELECT * FROM order_status_history WHERE orderId = ? ORDER BY createdAt ASC', row.id),
    ]);
    return {
      ...rowToDetail(row),
      attachments: attachments.map(rowToAttachment),
      timeline: timeline.map(rowToTimelineEvent),
    };
  },

  /** Creates a GR and appends its initial pending status history row.
   * Checks for an existing GR number first so a duplicate surfaces as a
   * clear "already exists" error rather than the raw SQLite UNIQUE
   * constraint failure (which expo-sqlite's web driver reports as an opaque
   * "Error finalizing statement", with no useful text for the user).
   *
   * If a soft-deleted GR with the same number exists (`isDeleted = 1`),
   * the stale row is physically removed (CASCADE cleans up children) so
   * the new GR can be inserted — matching the Excel import's behaviour. */
  async create(input: GRCreateInput): Promise<LocalGRDetail> {
    await ensureDatabaseReady();
    const db = await getDatabase();

    // Ensure foreign keys (including ON DELETE CASCADE) are enforced.
    await db.runAsync('PRAGMA foreign_keys = ON');

    // Check for an *active* GR with this number.
    const activeDuplicate = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM orders WHERE orderNumber = ? AND isDeleted = 0',
      input.grNumber
    );
    if (activeDuplicate) {
      throw new Error(`GR number "${input.grNumber}" already exists. Please use a different GR number.`);
    }

    // If a soft-deleted GR exists, physically remove it so the UNIQUE
    // constraint on `orderNumber` is freed.
    const staleRow = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM orders WHERE orderNumber = ? AND isDeleted = 1',
      input.grNumber
    );
    if (staleRow) {
      await db.runAsync('DELETE FROM orders WHERE id = ?', [staleRow.id]);
    }
    const id = uuid();
    const createdAt = nowIso();
    const extendedCols = EXTENDED_FIELD_KEYS.join(', ');
    const extendedPlaceholders = EXTENDED_FIELD_KEYS.map(() => '?').join(', ');
    const extendedValues = EXTENDED_FIELD_KEYS.map((key) => (input[key] as string | number | undefined) ?? null);
    // Stamp the creating user's area (Staff only — Admin/Owner have none) so
    // a Staff-created GR is immediately visible in that Staff member's own
    // area-scoped views instead of silently vanishing for lacking an area.
    const creatorArea = useUserStore.getState().user?.area ?? null;
    await db.runAsync(
      `INSERT INTO orders (
        id, orderNumber, companyId, consignorName, consigneeName, particulars,
        packageCount, pickupAddress, deliveryAddress, pickupTime, weight,
        priority, status, trackingCode, notes, hasSlip, slipData, source, ${extendedCols}, area,
        createdAt, updatedAt, isDeleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${extendedPlaceholders}, ?, ?, ?, ?)`,
      [
        id,
        input.grNumber,
        input.companyId ?? null,
        input.consignorName,
        input.consigneeName,
        input.particulars ?? null,
        input.packageCount ?? null,
        input.pickupAddress,
        input.deliveryAddress,
        input.pickupTime,
        input.weight ?? null,
        'normal',
        'pending',
        input.trackingCode ?? null,
        input.notes ?? null,
        0,
        input.slipData ?? null,
        input.source ?? 'manual',
        ...extendedValues,
        creatorArea,
        createdAt,
        createdAt,
        0,
      ]
    );
    await db.runAsync(
      'INSERT INTO order_status_history (id, orderId, status, note, createdAt) VALUES (?, ?, ?, ?, ?)',
      [uuid(), id, 'pending', 'Created', createdAt]
    );
    // Covers a GR created with toPay already 0 (nothing owed) — it should
    // never sit in "Pending" when there's nothing outstanding.
    await reconcileDeliveredStatus(db, id);
    const detail = await this.getById(id);
    if (!detail) throw new Error('Failed to create GR');
    return detail;
  },

  /** Editable fields. Equivalent of `PATCH /admin/orders/{id}`. */
  async update(id: string, input: GRUpdateInput): Promise<LocalGRDetail | null> {
    await ensureDatabaseReady();
    await assertStaffOrderAccess(id);
    const db = await getDatabase();
    const fields: string[] = [];
    const bind: (string | number | null)[] = [];

    const setIf = <K extends keyof GRUpdateInput>(key: K, col: string) => {
      if (input[key] !== undefined) {
        fields.push(`${col} = ?`);
        bind.push(input[key] as string | number | null);
      }
    };

    setIf('consignorName', 'consignorName');
    setIf('consigneeName', 'consigneeName');
    setIf('particulars', 'particulars');
    setIf('pickupAddress', 'pickupAddress');
    setIf('deliveryAddress', 'deliveryAddress');
    setIf('pickupTime', 'pickupTime');
    setIf('packageCount', 'packageCount');
    setIf('weight', 'weight');
    setIf('notes', 'notes');
    setIf('paymentAmount', 'paymentAmount');
    for (const key of EXTENDED_FIELD_KEYS) setIf(key, key);

    if (fields.length === 0) return this.getById(id);
    bind.push(nowIso(), id);
    await db.runAsync(`UPDATE orders SET ${fields.join(', ')}, updatedAt = ? WHERE id = ?`, bind);
    // Edit GR can change `toPay` (e.g. down to/under what's already paid) or
    // the legacy `paymentAmount` field directly — re-check whether that
    // leaves nothing outstanding.
    if (input.toPay !== undefined || input.paymentAmount !== undefined) {
      await reconcileDeliveredStatus(db, id);
    }
    return this.getById(id);
  },

  /** Soft-deletes a GR: sets `isDeleted = 1`, the same flag every read query
   * (`list`, `getById`, `getByOrderNumber`) already filters on — so the row
   * simply stops appearing anywhere without actually being removed from the
   * on-device database. Never touches any other row. Mirrors the backend's
   * `DELETE /admin/orders/{id}` soft-delete for the (separate, backend-synced)
   * web GR records — this only affects the local copy on this device. */
  async delete(id: string): Promise<void> {
    await ensureDatabaseReady();
    await assertStaffOrderAccess(id);
    const db = await getDatabase();
    await db.runAsync('UPDATE orders SET isDeleted = 1, updatedAt = ? WHERE id = ?', [nowIso(), id]);
  },

  /** Appends a status-history row whenever the status changes. */
  async updateStatus(id: string, status: string): Promise<LocalGRDetail | null> {
    await ensureDatabaseReady();
    await assertStaffOrderAccess(id);
    const db = await getDatabase();
    await db.runAsync('UPDATE orders SET status = ?, updatedAt = ? WHERE id = ?', [status, nowIso(), id]);
    await db.runAsync(
      'INSERT INTO order_status_history (id, orderId, status, note, createdAt) VALUES (?, ?, ?, ?, ?)',
      [uuid(), id, status, null, nowIso()]
    );
    return this.getById(id);
  },

  async assignDriver(id: string, driverId: string): Promise<LocalGRDetail | null> {
    await ensureDatabaseReady();
    await assertStaffOrderAccess(id);
    const db = await getDatabase();
    await db.runAsync('UPDATE orders SET driverId = ?, updatedAt = ? WHERE id = ?', [driverId, nowIso(), id]);
    return this.getById(id);
  },

  async assignStaff(id: string, staffId: string): Promise<LocalGRDetail | null> {
    await ensureDatabaseReady();
    await assertStaffOrderAccess(id);
    const db = await getDatabase();
    await db.runAsync('UPDATE orders SET assignedStaffId = ?, updatedAt = ? WHERE id = ?', [staffId, nowIso(), id]);
    return this.getById(id);
  },

  /** Marks a GR deleted locally. Equivalent of a soft-delete. */
  async remove(id: string): Promise<void> {
    await ensureDatabaseReady();
    await assertStaffOrderAccess(id);
    const db = await getDatabase();
    await db.runAsync('UPDATE orders SET isDeleted = 1, updatedAt = ? WHERE id = ?', [nowIso(), id]);
  },

  /** Local record for an uploaded slip. Returns null if the order is missing. */
  async addAttachment(
    orderId: string,
    attachment: { originalFilename: string; mimeType: string; localUri: string; fileSizeBytes?: number }
  ): Promise<LocalAttachment | null> {
    await ensureDatabaseReady();
    await assertStaffOrderAccess(orderId);
    const db = await getDatabase();
    const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM orders WHERE id = ?', orderId);
    if (!existing) return null;
    const id = uuid();
    await db.runAsync(
      `INSERT INTO order_attachments (id, orderId, fileKind, originalFilename, mimeType, fileSizeBytes, localUri, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, orderId, 'generic', attachment.originalFilename, attachment.mimeType, attachment.fileSizeBytes ?? 0, attachment.localUri, nowIso()]
    );
    await db.runAsync('UPDATE orders SET hasSlip = 1, updatedAt = ? WHERE id = ?', [nowIso(), orderId]);
    return this.getById(orderId)?.then((g) => g?.attachments.find((a) => a.id === id) ?? null);
  },

  /**
   * Recent real GR/shipment events for the dashboard's Recent Activity feed:
   * status transitions (including the "Created" row every GR gets) plus
   * slip uploads, newest first. Read-only aggregation over the existing
   * `order_status_history` / `order_attachments` tables — no schema change.
   */
  async listRecentActivity(limit = 10): Promise<ActivityEvent[]> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    const historyWindow = Math.max(limit * 4, 40);
    const scopedArea = resolveAreaScope(undefined);
    const areaClause = scopedArea ? 'AND o.area = ?' : '';

    const [historyRows, attachmentRows] = await Promise.all([
      db.getAllAsync<any>(
        `SELECT h.id, h.orderId, h.status, h.note, h.createdAt, o.orderNumber
         FROM order_status_history h
         JOIN orders o ON o.id = h.orderId AND o.isDeleted = 0 ${areaClause}
         ORDER BY h.createdAt DESC LIMIT ?`,
        [...(scopedArea ? [scopedArea] : []), historyWindow]
      ),
      db.getAllAsync<any>(
        `SELECT a.id, a.orderId, a.createdAt, o.orderNumber
         FROM order_attachments a
         JOIN orders o ON o.id = a.orderId AND o.isDeleted = 0 ${areaClause}
         ORDER BY a.createdAt DESC LIMIT ?`,
        [...(scopedArea ? [scopedArea] : []), limit]
      ),
    ]);

    // Group history rows by order, oldest-first, so each row can carry the
    // status it transitioned *from* (the "changed from X to Y" description).
    const byOrder = new Map<string, any[]>();
    for (const row of [...historyRows].reverse()) {
      const list = byOrder.get(row.orderId) ?? [];
      list.push(row);
      byOrder.set(row.orderId, list);
    }

    const statusEvents: ActivityEvent[] = [];
    for (const rows of byOrder.values()) {
      rows.forEach((row, index) => {
        const isCreated = index === 0 && row.note === 'Created';
        statusEvents.push({
          id: row.id,
          kind: isCreated ? 'created' : 'status',
          orderId: row.orderId,
          orderNumber: row.orderNumber,
          status: row.status,
          previousStatus: index > 0 ? rows[index - 1].status : null,
          createdAt: row.createdAt,
        });
      });
    }

    const uploadEvents: ActivityEvent[] = attachmentRows.map((row) => ({
      id: row.id,
      kind: 'upload',
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      createdAt: row.createdAt,
    }));

    return [...statusEvents, ...uploadEvents]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  },

  // ---- Lookup tables (GR pickers: companies, drivers, staff) ----

  async listCompanies(): Promise<PickerRow[]> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ id: string; name: string }>('SELECT id, name FROM companies ORDER BY name ASC');
    return rows.map((r) => ({ id: r.id, name: r.name }));
  },

  async upsertCompanies(items: { id: string; name: string }[]): Promise<void> {
    if (items.length === 0) return;
    await ensureDatabaseReady();
    const db = await getDatabase();
    for (const c of items) {
      await db.runAsync(
        'INSERT INTO companies (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name',
        [c.id, c.name]
      );
    }
  },

  async listDrivers(): Promise<PickerRow[]> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ id: string; fullName: string }>('SELECT id, fullName FROM drivers ORDER BY fullName ASC');
    return rows.map((r) => ({ id: r.id, name: r.fullName }));
  },

  async upsertDrivers(items: { id: string; fullName: string }[]): Promise<void> {
    if (items.length === 0) return;
    await ensureDatabaseReady();
    const db = await getDatabase();
    for (const d of items) {
      await db.runAsync(
        'INSERT INTO drivers (id, fullName) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET fullName = excluded.fullName',
        [d.id, d.fullName]
      );
    }
  },

  async listStaff(): Promise<PickerRow[]> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ id: string; name: string }>('SELECT id, name FROM employees ORDER BY name ASC');
    return rows.map((r) => ({ id: r.id, name: r.name }));
  },

  async upsertStaff(items: { id: string; name: string }[]): Promise<void> {
    if (items.length === 0) return;
    await ensureDatabaseReady();
    const db = await getDatabase();
    for (const e of items) {
      await db.runAsync(
        'INSERT INTO employees (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name',
        [e.id, e.name]
      );
    }
  },

  // ---- Payments ----

  /**
   * Record a new payment against an order, then recompute the running total
   * and flip the GR to "delivered" once the total paid reaches the bill
   * (`toPay`), leaving it untouched otherwise. This is the single write path
   * for payments (the Receive Payment sheet in `AdminGRDetailsScreen` calls
   * only this).
   *
   * Deliberately NOT wrapped in `db.withTransactionAsync` — expo-sqlite's web
   * backend does not support the exclusive variant at all, and the
   * non-exclusive one can be interrupted by concurrent reads (e.g. the GR
   * list's `Promise.all` of `getPaymentSummary` calls), which was observed to
   * leave the web connection stuck mid-transaction and every subsequent read
   * returning the same stale snapshot (every GR showing identical amounts).
   * This app has a single writer at a time, so plain sequential awaits are
   * sufficient — SQLite runs each statement serially on this connection
   * regardless.
   */
  async addPayment(input: {
    orderId: string;
    amount: number;
    paymentMethod?: string;
    notes?: string;
    recordedBy?: string;
  }): Promise<LocalPayment> {
    await ensureDatabaseReady();
    await assertStaffOrderAccess(input.orderId);
    if (!(input.amount > 0)) {
      throw new Error('Payment amount must be greater than zero.');
    }
    const db = await getDatabase();
    await db.runAsync('PRAGMA foreign_keys = ON');
    const id = uuid();
    const createdAt = nowIso();

    const order = await db.getFirstAsync<{ toPay: number | null; status: string }>(
      'SELECT toPay, status FROM orders WHERE id = ?',
      [input.orderId]
    );
    if (!order) {
      throw new Error('GR not found.');
    }

    const toPay = Number(order.toPay ?? 0);
    const alreadyPaid = Number(
      (await db.getFirstAsync<{ total: number }>(
        'SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE orderId = ?',
        [input.orderId]
      ))?.total ?? 0
    );

    // Reject overpayment server-side (not just in the UI) so a stale
    // balance can never push Paid > Total Bill / Remaining below zero.
    if (toPay > 0 && alreadyPaid + input.amount > toPay + 0.005) {
      const remaining = Math.max(0, toPay - alreadyPaid);
      throw new Error(`Payment cannot exceed the remaining amount of ₹${remaining.toFixed(2)}.`);
    }

    await db.runAsync(
      `INSERT INTO payments (id, orderId, amount, paymentMethod, notes, recordedBy, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.orderId, input.amount, input.paymentMethod ?? null, input.notes ?? null, input.recordedBy ?? null, createdAt]
    );

    await reconcileDeliveredStatus(db, input.orderId);

    return { id, ...input, paymentMethod: input.paymentMethod ?? null, notes: input.notes ?? null, recordedBy: input.recordedBy ?? null, createdAt };
  },

  /** List all payments for a given order, newest first. */
  async listPayments(orderId: string): Promise<LocalPayment[]> {
    await ensureDatabaseReady();
    await assertStaffOrderAccess(orderId);
    const db = await getDatabase();
    const rows = await db.getAllAsync<any>(
      'SELECT * FROM payments WHERE orderId = ? ORDER BY createdAt DESC',
      [orderId]
    );
    return rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      amount: r.amount,
      paymentMethod: r.paymentMethod ?? null,
      notes: r.notes ?? null,
      recordedBy: r.recordedBy ?? null,
      createdAt: r.createdAt,
    }));
  },

  /** Aggregated payment summary for a single order. */
  async getPaymentSummary(orderId: string): Promise<PaymentSummary | null> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    const order = await db.getFirstAsync<any>(
      'SELECT id, orderNumber, toPay, area FROM orders WHERE id = ? AND isDeleted = 0',
      [orderId]
    );
    if (!order) return null;
    if (!orderRowInStaffScope(order)) return null;

    const toPay = Number(order.toPay ?? 0);
    const totalPaid = Number(
      (await db.getFirstAsync<{ total: number }>(
        'SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE orderId = ?',
        [orderId]
      ))?.total ?? 0
    );
    const paymentCount = Number(
      (await db.getFirstAsync<{ cnt: number }>(
        'SELECT COUNT(*) AS cnt FROM payments WHERE orderId = ?',
        [orderId]
      ))?.cnt ?? 0
    );
    const payments = await this.listPayments(orderId);

    let paymentStatus = 'unpaid';
    if (toPay <= 0) paymentStatus = 'paid';
    else if (totalPaid <= 0) paymentStatus = 'unpaid';
    else if (totalPaid >= toPay) paymentStatus = totalPaid === toPay ? 'paid' : 'overpaid';
    else paymentStatus = 'partial';

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      toPay,
      totalPaid,
      balance: toPay - totalPaid,
      paymentStatus,
      paymentCount,
      payments,
    };
  },

  /** Revenue aggregation matching `backend/order_repository.get_revenue_overview()`.
   *  Revenue per GR = COALESCE(paymentAmount, 0) + COALESCE(toPay, 0).
   *  Date bucketing uses grDate if set, falling back to createdAt. */
  async getRevenueOverview(): Promise<{
    today: number;
    yesterday: number;
    week: number;
    prevWeek: number;
    month: number;
    prevMonth: number;
    totalCollected: number;
    outstandingAmount: number;
    /** Count of GRs with at least one payment recorded against them. */
    collectedGRCount: number;
    /** Count of GRs with a remaining balance greater than zero. */
    outstandingGRCount: number;
    /** Real payments (by when they were actually received) this calendar month. */
    collectedThisMonth: number;
    /** Same, for the previous calendar month — for a real trend, not a guess. */
    collectedPrevMonth: number;
  }> {
    await ensureDatabaseReady();
    const db = await getDatabase();

    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = now.getUTCMonth();
    const dd = now.getUTCDate();
    const dayOfWeek = now.getUTCDay(); // 0=Sun

    const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
    const dayStart = (y: number, m: number, d: number) => fmt(new Date(Date.UTC(y, m, d, 0, 0, 0)));
    const dayEnd = (y: number, m: number, d: number) => fmt(new Date(Date.UTC(y, m, d + 1, 0, 0, 0)));

    const startToday = dayStart(yyyy, mm, dd);
    const startYesterday = dayStart(yyyy, mm, dd - 1);
    // ISO week: Monday = 0 … Sunday = 6
    const weekDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startOfWeek = dayStart(yyyy, mm, dd - weekDay);
    const startPrevWeek = dayStart(yyyy, mm, dd - weekDay - 7);
    const startOfMonth = dayStart(yyyy, mm, 1);
    const prevMonthDate = new Date(Date.UTC(yyyy, mm, 0)); // last day of prev month
    const startPrevMonth = dayStart(prevMonthDate.getUTCFullYear(), prevMonthDate.getUTCMonth(), 1);

    const scopedArea = resolveAreaScope(undefined);
    const areaClause = scopedArea ? 'AND area = ?' : '';

    // "Actual paid" per order must come from the `payments` ledger, not the
    // legacy `orders.paymentAmount` column — `addPayment()` only ever
    // inserts into `payments`, it never updates `paymentAmount` again after
    // a GR's creation/import. Summing `paymentAmount` here meant Total
    // Collected / Outstanding on the dashboard silently went stale the
    // moment any real payment was recorded through Receive Payment, and
    // never caught up. `MAX(ledger, paymentAmount)` covers legacy rows that
    // predate the ledger (paymentAmount set once, no payments rows yet).
    const row = await db.getFirstAsync<{
      today: number; yesterday: number; week: number; prev_week: number;
      month: number; prev_month: number; total_collected: number; outstanding: number;
      collected_count: number; outstanding_count: number;
    }>(
      `SELECT
         SUM(CASE WHEN COALESCE(o.grDate, o.createdAt) >= ? AND COALESCE(o.grDate, o.createdAt) < ?
           THEN COALESCE(o.paymentAmount, 0) + COALESCE(o.toPay, 0) ELSE 0 END) AS today,
         SUM(CASE WHEN COALESCE(o.grDate, o.createdAt) >= ? AND COALESCE(o.grDate, o.createdAt) < ?
           THEN COALESCE(o.paymentAmount, 0) + COALESCE(o.toPay, 0) ELSE 0 END) AS yesterday,
         SUM(CASE WHEN COALESCE(o.grDate, o.createdAt) >= ? AND COALESCE(o.grDate, o.createdAt) < ?
           THEN COALESCE(o.paymentAmount, 0) + COALESCE(o.toPay, 0) ELSE 0 END) AS week,
         SUM(CASE WHEN COALESCE(o.grDate, o.createdAt) >= ? AND COALESCE(o.grDate, o.createdAt) < ?
           THEN COALESCE(o.paymentAmount, 0) + COALESCE(o.toPay, 0) ELSE 0 END) AS prev_week,
         SUM(CASE WHEN COALESCE(o.grDate, o.createdAt) >= ? AND COALESCE(o.grDate, o.createdAt) < ?
           THEN COALESCE(o.paymentAmount, 0) + COALESCE(o.toPay, 0) ELSE 0 END) AS month,
         SUM(CASE WHEN COALESCE(o.grDate, o.createdAt) >= ? AND COALESCE(o.grDate, o.createdAt) < ?
           THEN COALESCE(o.paymentAmount, 0) + COALESCE(o.toPay, 0) ELSE 0 END) AS prev_month,
         SUM(MAX(COALESCE(led.ledgerPaid, 0), COALESCE(o.paymentAmount, 0))) AS total_collected,
         SUM(MAX(COALESCE(o.toPay, 0) - MAX(COALESCE(led.ledgerPaid, 0), COALESCE(o.paymentAmount, 0)), 0)) AS outstanding,
         SUM(CASE WHEN MAX(COALESCE(led.ledgerPaid, 0), COALESCE(o.paymentAmount, 0)) > 0 THEN 1 ELSE 0 END) AS collected_count,
         SUM(CASE WHEN COALESCE(o.toPay, 0) - MAX(COALESCE(led.ledgerPaid, 0), COALESCE(o.paymentAmount, 0)) > 0.005 THEN 1 ELSE 0 END) AS outstanding_count
       FROM orders o
       LEFT JOIN (SELECT orderId, SUM(amount) AS ledgerPaid FROM payments GROUP BY orderId) led ON led.orderId = o.id
       WHERE o.isDeleted = 0 AND o.isActive = 1 ${areaClause}`,
      [
        startToday, dayEnd(yyyy, mm, dd),
        startYesterday, startToday,
        startOfWeek, dayEnd(yyyy, mm, dd),
        startPrevWeek, startOfWeek,
        startOfMonth, dayEnd(yyyy, mm, dd),
        startPrevMonth, startOfMonth,
        ...(scopedArea ? [scopedArea] : []),
      ],
    );

    // Real month-over-month trend for "Total Collected" — sums payments
    // actually *received* (by `payments.createdAt`) in each period, not a
    // point-in-time snapshot, so the comparison means something. Deliberately
    // NOT done for "Outstanding": there is no history of past unpaid
    // balances anywhere in this schema, so a trend for it would have to be
    // invented rather than computed from real data.
    const collectedTrendRow = await db.getFirstAsync<{ this_month: number; prev_month: number }>(
      `SELECT
         SUM(CASE WHEN p.createdAt >= ? AND p.createdAt < ? THEN p.amount ELSE 0 END) AS this_month,
         SUM(CASE WHEN p.createdAt >= ? AND p.createdAt < ? THEN p.amount ELSE 0 END) AS prev_month
       FROM payments p
       JOIN orders o ON o.id = p.orderId
       WHERE o.isDeleted = 0 AND o.isActive = 1 ${areaClause}`,
      [
        startOfMonth, dayEnd(yyyy, mm, dd),
        startPrevMonth, startOfMonth,
        ...(scopedArea ? [scopedArea] : []),
      ],
    );

    return {
      today: Number(row?.today ?? 0),
      yesterday: Number(row?.yesterday ?? 0),
      week: Number(row?.week ?? 0),
      prevWeek: Number(row?.prev_week ?? 0),
      month: Number(row?.month ?? 0),
      prevMonth: Number(row?.prev_month ?? 0),
      totalCollected: Number(row?.total_collected ?? 0),
      outstandingAmount: Number(row?.outstanding ?? 0),
      collectedGRCount: Number(row?.collected_count ?? 0),
      outstandingGRCount: Number(row?.outstanding_count ?? 0),
      collectedThisMonth: Number(collectedTrendRow?.this_month ?? 0),
      collectedPrevMonth: Number(collectedTrendRow?.prev_month ?? 0),
    };
  },

  // ---- Receiving Details ----

  /** A single GR enriched with its payment summary for the Receiving Details list. */
  async listReceiving(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    paymentStatus?: string; // 'all' | 'unpaid' | 'partial' | 'paid' | 'overpaid'
    customerId?: string;    // filter by consigneeName match
    dateFrom?: string;      // ISO date string
    dateTo?: string;        // ISO date string
  } = {}): Promise<{ items: ReceivingListItem[]; total: number }> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;

    // Build a CTE that joins orders with aggregated payment data
    const clauses: string[] = ['o.isDeleted = 0'];
    const bind: (string | number)[] = [];

    if (params.search) {
      clauses.push('(o.orderNumber LIKE ? OR o.consigneeName LIKE ? OR o.consignorName LIKE ?)');
      const like = `%${params.search}%`;
      bind.push(like, like, like);
    }
    if (params.customerId) {
      clauses.push('o.consigneeName = ?');
      bind.push(params.customerId);
    }
    if (params.dateFrom) {
      clauses.push("COALESCE(o.grDate, o.createdAt) >= ?");
      bind.push(params.dateFrom);
    }
    if (params.dateTo) {
      clauses.push("COALESCE(o.grDate, o.createdAt) <= ?");
      bind.push(params.dateTo);
    }
    const scopedArea = resolveAreaScope(undefined);
    if (scopedArea) {
      clauses.push('o.area = ?');
      bind.push(scopedArea);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    // Payment status filter is applied after the CTE since it depends on computed columns
    const havingClause = params.paymentStatus && params.paymentStatus !== 'all'
      ? `HAVING payment_status = ?`
      : '';
    const havingBind = params.paymentStatus && params.paymentStatus !== 'all'
      ? [params.paymentStatus]
      : [];

    const cte = `
      WITH order_payments AS (
        SELECT
          o.id,
          o.orderNumber,
          o.consigneeName,
          o.consignorName,
          o.pickupAddress,
          o.deliveryAddress,
          o.status AS grStatus,
          o.toPay,
          o.createdAt,
          COALESCE(SUM(p.amount), 0) AS totalPaid,
          COUNT(p.id) AS paymentCount,
          CASE
            WHEN COALESCE(o.toPay, 0) <= 0 THEN 'paid'
            WHEN COALESCE(SUM(p.amount), 0) <= 0 THEN 'unpaid'
            WHEN COALESCE(SUM(p.amount), 0) >= COALESCE(o.toPay, 0) THEN
              CASE WHEN COALESCE(SUM(p.amount), 0) = COALESCE(o.toPay, 0) THEN 'paid' ELSE 'overpaid' END
            ELSE 'partial'
          END AS payment_status
        FROM orders o
        LEFT JOIN payments p ON p.orderId = o.id
        ${where}
        GROUP BY o.id
      )
    `;

    const countRow = await db.getFirstAsync<{ total: number }>(
      `${cte} SELECT COUNT(*) AS total FROM order_payments ${havingClause}`,
      [...bind, ...havingBind]
    );

    const rows = await db.getAllAsync<any>(
      `${cte}
       SELECT * FROM order_payments ${havingClause}
       ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      [...bind, ...havingBind, pageSize, (page - 1) * pageSize]
    );

    const items: ReceivingListItem[] = rows.map((r) => ({
      id: r.id,
      orderNumber: r.orderNumber,
      consigneeName: r.consigneeName ?? null,
      consignorName: r.consignorName ?? null,
      pickupAddress: r.pickupAddress,
      deliveryAddress: r.deliveryAddress,
      grStatus: r.grStatus,
      toPay: Number(r.toPay ?? 0),
      totalPaid: Number(r.totalPaid ?? 0),
      balance: Number(r.toPay ?? 0) - Number(r.totalPaid ?? 0),
      paymentStatus: r.payment_status,
      paymentCount: Number(r.paymentCount ?? 0),
      createdAt: r.createdAt,
    }));

    return { items, total: countRow?.total ?? 0 };
  },

  /** Aggregate totals for the Receiving Details summary cards. */
  async getReceivingOverview(): Promise<ReceivingOverview> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    const scopedArea = resolveAreaScope(undefined);
    const areaClause = scopedArea ? 'AND o.area = ?' : '';

    const row = await db.getFirstAsync<{
      total_to_pay: number;
      total_paid: number;
      total_transactions: number;
      unpaid_count: number;
      partial_count: number;
      paid_count: number;
      overpaid_count: number;
      gr_count: number;
    }>(
      `SELECT
        SUM(COALESCE(o.toPay, 0)) AS total_to_pay,
        COALESCE(SUM(paid.totalPaid), 0) AS total_paid,
        COALESCE(SUM(paid.paymentCount), 0) AS total_transactions,
        SUM(CASE WHEN paid.payment_status = 'unpaid' THEN 1 ELSE 0 END) AS unpaid_count,
        SUM(CASE WHEN paid.payment_status = 'partial' THEN 1 ELSE 0 END) AS partial_count,
        SUM(CASE WHEN paid.payment_status = 'paid' THEN 1 ELSE 0 END) AS paid_count,
        SUM(CASE WHEN paid.payment_status = 'overpaid' THEN 1 ELSE 0 END) AS overpaid_count,
        COUNT(o.id) AS gr_count
      FROM orders o
      LEFT JOIN (
        SELECT
          orderId,
          SUM(amount) AS totalPaid,
          COUNT(id) AS paymentCount,
          CASE
            WHEN SUM(amount) <= 0 THEN 'unpaid'
            WHEN SUM(amount) >= (SELECT COALESCE(toPay, 0) FROM orders WHERE id = payments.orderId) THEN
              CASE WHEN SUM(amount) = (SELECT COALESCE(toPay, 0) FROM orders WHERE id = payments.orderId) THEN 'paid' ELSE 'overpaid' END
            ELSE 'partial'
          END AS payment_status
        FROM payments
        GROUP BY orderId
      ) paid ON paid.orderId = o.id
      WHERE o.isDeleted = 0 ${areaClause}`,
      scopedArea ? [scopedArea] : []
    );

    const totalToPay = Number(row?.total_to_pay ?? 0);
    const totalPaid = Number(row?.total_paid ?? 0);

    return {
      totalToPay,
      totalPaid,
      outstanding: totalToPay - totalPaid,
      totalTransactions: Number(row?.total_transactions ?? 0),
      unpaidCount: Number(row?.unpaid_count ?? 0),
      partialCount: Number(row?.partial_count ?? 0),
      paidCount: Number(row?.paid_count ?? 0),
      overpaidCount: Number(row?.overpaid_count ?? 0),
      grCount: Number(row?.gr_count ?? 0),
    };
  },

  // ---- Shops (Excel-assigned areas) ----

  /** Aggregate GR counts/financials grouped by area, for the "All Shops"
   * list. Only active GRs with a resolved area are included — GRs imported
   * before the area system existed (or with an unmatched consignee name)
   * are simply absent from every shop's totals, never miscounted. */
  async getShopsOverview(): Promise<ShopSummary[]> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    const scopedArea = resolveAreaScope(undefined);
    // Same fix as `getRevenueOverview` — `paymentAmount` is a legacy column
    // `addPayment()` never updates after a GR's creation/import; the real
    // paid amount lives in the `payments` ledger. Summing `paymentAmount`
    // alone meant a shop's "Total Collected" never reflected payments
    // actually received through Receive Payment.
    const rows = await db.getAllAsync<any>(
      `SELECT
         o.area AS area,
         COUNT(*) AS total,
         SUM(CASE WHEN o.status = 'pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN o.status = 'cleared' THEN 1 ELSE 0 END) AS cleared,
         SUM(CASE WHEN o.status = 'uncleared' THEN 1 ELSE 0 END) AS uncleared,
         SUM(CASE WHEN o.status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
         SUM(COALESCE(o.toPay, 0)) AS totalToPay,
         SUM(MAX(COALESCE(led.ledgerPaid, 0), COALESCE(o.paymentAmount, 0))) AS totalCollected
       FROM orders o
       LEFT JOIN (SELECT orderId, SUM(amount) AS ledgerPaid FROM payments GROUP BY orderId) led ON led.orderId = o.id
       WHERE o.isDeleted = 0 AND o.area IS NOT NULL AND o.area != '' ${scopedArea ? 'AND o.area = ?' : ''}
       GROUP BY o.area`,
      scopedArea ? [scopedArea] : []
    );
    return rows.map((r) => {
      const totalToPay = Number(r.totalToPay ?? 0);
      const totalCollected = Number(r.totalCollected ?? 0);
      return {
        area: r.area,
        total: Number(r.total ?? 0),
        pending: Number(r.pending ?? 0),
        cleared: Number(r.cleared ?? 0),
        uncleared: Number(r.uncleared ?? 0),
        delivered: Number(r.delivered ?? 0),
        totalToPay,
        totalCollected,
        outstanding: Math.max(0, totalToPay - totalCollected),
      };
    });
  },

  /** Distinct shops (consignor names) with their active-GR counts — powers
   * both the Staff "All Shops" list (always their own area, `area` param
   * ignored) and Admin's Area → Shops drill-down (`area` explicitly pins
   * which area's shops to list). Scoped via `resolveAreaScope`: a Staff user
   * can ONLY ever see shops that have GRs in their own area regardless of
   * what `area` is passed, and an unassigned Staff member (no area) resolves
   * to the sentinel area that matches nothing, so the result is always empty
   * rather than leaking every shop in the system. Admin passing no `area`
   * sees shops across every area (unscoped). `search` optionally narrows by
   * shop name (LIKE, case-sensitive SQLite). */
  async getShopsWithCounts(search?: string, area?: string): Promise<ShopCount[]> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    const scopedArea = resolveAreaScope(area);
    const clauses = ['isDeleted = 0', 'consignorName IS NOT NULL', "consignorName != ''"];
    const bind: string[] = [];
    if (scopedArea) {
      clauses.push('area = ?');
      bind.push(scopedArea);
    }
    if (search && search.trim()) {
      clauses.push('consignorName LIKE ?');
      bind.push(`%${search.trim()}%`);
    }
    const rows = await db.getAllAsync<{ name: string; grCount: number }>(
      `SELECT consignorName AS name, COUNT(*) AS grCount
       FROM orders
       WHERE ${clauses.join(' AND ')}
       GROUP BY consignorName
       ORDER BY consignorName ASC`,
      bind
    );
    return rows.map((r) => ({ name: r.name, grCount: Number(r.grCount ?? 0) }));
  },

  // ---- Staff Daily Work (Payment History → Staff Daily Work) ----

  /** Total collection + unique GR count for one staff member on one day.
   * `staffId` matches `payments.recordedBy`, stamped when a Staff user (or
   * an Admin on their behalf) records a collection — see
   * `AdminGRDetailsScreen`'s "Collected By" picker. Collection sums every
   * matching payment row; GR count is DISTINCT so a GR paid off across
   * several partial payments by the same staff member on the same day is
   * never double-counted. */
  async getStaffDailySummary(staffId: string, dateIso: string): Promise<{ totalCollection: number; totalGRs: number }> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    const day = dateIso.slice(0, 10);
    const scopedStaffId = resolveStaffScope(staffId);
    const row = await db.getFirstAsync<{ totalCollection: number; totalGRs: number }>(
      `SELECT COALESCE(SUM(p.amount), 0) AS totalCollection, COUNT(DISTINCT p.orderId) AS totalGRs
       FROM payments p
       JOIN orders o ON o.id = p.orderId AND o.isDeleted = 0
       WHERE p.recordedBy = ? AND substr(p.createdAt, 1, 10) = ?`,
      [scopedStaffId, day]
    );
    return { totalCollection: Number(row?.totalCollection ?? 0), totalGRs: Number(row?.totalGRs ?? 0) };
  },

  /** One row per GR that staff member collected on that day (amounts summed
   * per GR, in case of multiple partial payments), for the Staff Detail
   * page's GR list. */
  async getStaffDailyGRs(staffId: string, dateIso: string): Promise<StaffDailyGR[]> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    const day = dateIso.slice(0, 10);
    const scopedStaffId = resolveStaffScope(staffId);
    const rows = await db.getAllAsync<any>(
      `SELECT o.id AS orderId, o.orderNumber, o.consignorName, o.consigneeName, o.status,
              SUM(p.amount) AS amountCollected, MAX(p.createdAt) AS lastPaymentAt
       FROM payments p
       JOIN orders o ON o.id = p.orderId AND o.isDeleted = 0
       WHERE p.recordedBy = ? AND substr(p.createdAt, 1, 10) = ?
       GROUP BY o.id
       ORDER BY lastPaymentAt DESC`,
      [scopedStaffId, day]
    );
    return rows.map((r) => ({
      orderId: r.orderId,
      orderNumber: r.orderNumber,
      consignorName: r.consignorName ?? null,
      consigneeName: r.consigneeName ?? null,
      status: r.status,
      amountCollected: Number(r.amountCollected ?? 0),
    }));
  },

  /** Sum of payments received today. */
  async getTodayCollection(): Promise<number> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    const today = new Date().toISOString().slice(0, 10);
    const scopedArea = resolveAreaScope(undefined);
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(p.amount), 0) AS total
       FROM payments p
       JOIN orders o ON o.id = p.orderId
       WHERE p.createdAt >= ? AND p.createdAt < ? ${scopedArea ? 'AND o.area = ?' : ''}`,
      [today, today + 'T23:59:59', ...(scopedArea ? [scopedArea] : [])]
    );
    return Number(row?.total ?? 0);
  },
};