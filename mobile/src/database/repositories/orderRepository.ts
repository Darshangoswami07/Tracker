import { ensureDatabaseReady, getDatabase } from '../database';
import { uuid } from '../../utils/uuid';

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
}

export interface GRListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
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

  /** Full GR record including its attachments and status timeline.
   * Equivalent of `GET /admin/orders/{id}`. */
  async getById(id: string): Promise<LocalGRDetail | null> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    const row = await db.getFirstAsync<any>('SELECT * FROM orders WHERE id = ? AND isDeleted = 0', id);
    if (!row) return null;
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
   * "Error finalizing statement", with no useful text for the user). */
  async create(input: GRCreateInput): Promise<LocalGRDetail> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    const duplicate = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM orders WHERE orderNumber = ?',
      input.grNumber
    );
    if (duplicate) {
      throw new Error(`GR number "${input.grNumber}" already exists. Please use a different GR number.`);
    }
    const id = uuid();
    const createdAt = nowIso();
    const extendedCols = EXTENDED_FIELD_KEYS.join(', ');
    const extendedPlaceholders = EXTENDED_FIELD_KEYS.map(() => '?').join(', ');
    const extendedValues = EXTENDED_FIELD_KEYS.map((key) => (input[key] as string | number | undefined) ?? null);
    await db.runAsync(
      `INSERT INTO orders (
        id, orderNumber, companyId, consignorName, consigneeName, particulars,
        packageCount, pickupAddress, deliveryAddress, pickupTime, weight,
        priority, status, trackingCode, notes, hasSlip, slipData, source, ${extendedCols},
        createdAt, updatedAt, isDeleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${extendedPlaceholders}, ?, ?, ?)`,
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
        createdAt,
        createdAt,
        0,
      ]
    );
    await db.runAsync(
      'INSERT INTO order_status_history (id, orderId, status, note, createdAt) VALUES (?, ?, ?, ?, ?)',
      [uuid(), id, 'pending', 'Created', createdAt]
    );
    const detail = await this.getById(id);
    if (!detail) throw new Error('Failed to create GR');
    return detail;
  },

  /** Editable fields. Equivalent of `PATCH /admin/orders/{id}`. */
  async update(id: string, input: GRUpdateInput): Promise<LocalGRDetail | null> {
    await ensureDatabaseReady();
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
    for (const key of EXTENDED_FIELD_KEYS) setIf(key, key);

    if (fields.length === 0) return this.getById(id);
    bind.push(nowIso(), id);
    await db.runAsync(`UPDATE orders SET ${fields.join(', ')}, updatedAt = ? WHERE id = ?`, bind);
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
    const db = await getDatabase();
    await db.runAsync('UPDATE orders SET isDeleted = 1, updatedAt = ? WHERE id = ?', [nowIso(), id]);
  },

  /** Appends a status-history row whenever the status changes. */
  async updateStatus(id: string, status: string): Promise<LocalGRDetail | null> {
    await ensureDatabaseReady();
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
    const db = await getDatabase();
    await db.runAsync('UPDATE orders SET driverId = ?, updatedAt = ? WHERE id = ?', [driverId, nowIso(), id]);
    return this.getById(id);
  },

  async assignStaff(id: string, staffId: string): Promise<LocalGRDetail | null> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    await db.runAsync('UPDATE orders SET assignedStaffId = ?, updatedAt = ? WHERE id = ?', [staffId, nowIso(), id]);
    return this.getById(id);
  },

  /** Marks a GR deleted locally. Equivalent of a soft-delete. */
  async remove(id: string): Promise<void> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    await db.runAsync('UPDATE orders SET isDeleted = 1, updatedAt = ? WHERE id = ?', [nowIso(), id]);
  },

  /** Local record for an uploaded slip. Returns null if the order is missing. */
  async addAttachment(
    orderId: string,
    attachment: { originalFilename: string; mimeType: string; localUri: string; fileSizeBytes?: number }
  ): Promise<LocalAttachment | null> {
    await ensureDatabaseReady();
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

    const [historyRows, attachmentRows] = await Promise.all([
      db.getAllAsync<any>(
        `SELECT h.id, h.orderId, h.status, h.note, h.createdAt, o.orderNumber
         FROM order_status_history h
         JOIN orders o ON o.id = h.orderId AND o.isDeleted = 0
         ORDER BY h.createdAt DESC LIMIT ?`,
        [historyWindow]
      ),
      db.getAllAsync<any>(
        `SELECT a.id, a.orderId, a.createdAt, o.orderNumber
         FROM order_attachments a
         JOIN orders o ON o.id = a.orderId AND o.isDeleted = 0
         ORDER BY a.createdAt DESC LIMIT ?`,
        [limit]
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
};