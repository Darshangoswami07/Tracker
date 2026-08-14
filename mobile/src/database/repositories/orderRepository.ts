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
}

/** Mirrors `GRAttachment` in `AdminGRDetailsScreen`. */
export interface LocalAttachment {
  id: string;
  originalFilename: string;
  mimeType: string;
  createdAt: string;
  url: string;
}

/** Mirrors `GRDetail` in `AdminGRDetailsScreen` / web `admin/src/types/gr.ts`. */
export interface LocalGRDetail {
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
  attachments: LocalAttachment[];
}

export interface GRCreateInput {
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
}

export interface GRUpdateInput {
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
});

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
  attachments: [],
});

const rowToAttachment = (row: any): LocalAttachment => ({
  id: row.id,
  originalFilename: row.originalFilename,
  mimeType: row.mimeType,
  createdAt: row.createdAt,
  url: row.remoteUrl ?? row.localUri ?? '',
});

export const orderRepository = {
  /**
   * Paginated GR list with optional status filter and free-text search over
   * GR number, consignor and consignee. Equivalent of `GET /admin/orders`.
   */
  async list(params: GRListParams = {}): Promise<GRListResult> {
    console.log('[GR] orderRepository.list START', params);
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

    console.log('[GR] SQL START', where);
    const countRow = await db.getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) AS total FROM orders ${where}`,
      bind
    );

    const rows = await db.getAllAsync<any>(
      `SELECT * FROM orders ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      [...bind, pageSize, (page - 1) * pageSize]
    );
    console.log('[GR] SQL COMPLETE rows =', rows.length, 'total =', countRow?.total);

    return { items: rows.map(rowToListItem), total: countRow?.total ?? 0 };
  },

  /** Full GR record including its attachments. Equivalent of `GET /admin/orders/{id}`. */
  async getById(id: string): Promise<LocalGRDetail | null> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    const row = await db.getFirstAsync<any>('SELECT * FROM orders WHERE id = ? AND isDeleted = 0', id);
    if (!row) return null;
    const attachments = await db.getAllAsync<any>(
      'SELECT * FROM order_attachments WHERE orderId = ? ORDER BY createdAt ASC',
      id
    );
    return { ...rowToDetail(row), attachments: attachments.map(rowToAttachment) };
  },

  /** Creates a GR and appends its initial pending status history row. */
  async create(input: GRCreateInput): Promise<LocalGRDetail> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    const id = uuid();
    const createdAt = nowIso();
    await db.runAsync(
      `INSERT INTO orders (
        id, orderNumber, companyId, consignorName, consigneeName, particulars,
        packageCount, pickupAddress, deliveryAddress, pickupTime, weight,
        priority, status, trackingCode, hasSlip, createdAt, updatedAt, isDeleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        0,
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

    if (fields.length === 0) return this.getById(id);
    bind.push(nowIso(), id);
    await db.runAsync(`UPDATE orders SET ${fields.join(', ')}, updatedAt = ? WHERE id = ?`, bind);
    return this.getById(id);
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
  async addAttachment(orderId: string, attachment: { originalFilename: string; mimeType: string; localUri: string }): Promise<LocalAttachment | null> {
    await ensureDatabaseReady();
    const db = await getDatabase();
    const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM orders WHERE id = ?', orderId);
    if (!existing) return null;
    const id = uuid();
    await db.runAsync(
      `INSERT INTO order_attachments (id, orderId, fileKind, originalFilename, mimeType, fileSizeBytes, localUri, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, orderId, 'generic', attachment.originalFilename, attachment.mimeType, 0, attachment.localUri, nowIso()]
    );
    await db.runAsync('UPDATE orders SET hasSlip = 1, updatedAt = ? WHERE id = ?', [nowIso(), orderId]);
    return this.getById(orderId)?.then((g) => g?.attachments.find((a) => a.id === id) ?? null);
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