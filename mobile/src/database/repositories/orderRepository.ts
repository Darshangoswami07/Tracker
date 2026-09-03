/**
 * GR / payments / staff-work data access — **API-backed**.
 *
 * Every method here is a thin wrapper over the authenticated FastAPI backend
 * (`Mobile → FastAPI → Neon`). There is no on-device database: SQLite has been
 * removed. The exported `orderRepository` object keeps the same method names
 * and return shapes it had under the old SQLite implementation so the screens
 * that consume it did not need to change.
 *
 * Authorization (role scoping, area scoping, "staff can only see their own
 * data") is enforced **server-side** now — the backend is the security
 * boundary, not this file.
 */
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { ENV } from '../../config/env';
import { uuid } from '../../utils/uuid';

/**
 * Unwraps a backend response. Most routers wrap payloads in the
 * `{ success, message, data }` envelope; a few (the `/payments` router) return
 * the pydantic model directly via `response_model`. Handle both.
 */
const body = <T>(res: { data: any }): T => {
  const d = res.data;
  if (d && typeof d === 'object' && 'success' in d && 'data' in d) return d.data as T;
  return d as T;
};

const RAW_ERROR = /Request failed with status code|AxiosError|Network Error/i;

/**
 * Runs an API call and, on failure, re-throws a plain `Error` carrying the
 * backend's own human-readable message (e.g. "Settlement amount cannot exceed
 * available balance.") when there is one. This preserves the behaviour screens
 * relied on under the old SQLite repository, which threw `new Error(<message>)`
 * directly — the screens display `error.message` verbatim.
 */
const withApiError = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (err: any) {
    const backendMsg = err?.response?.data?.error?.message;
    if (typeof backendMsg === 'string' && backendMsg && !RAW_ERROR.test(backendMsg)) {
      const wrapped = new Error(backendMsg);
      (wrapped as any).response = err.response;
      throw wrapped;
    }
    throw err;
  }
};

/**
 * Kept as a no-op export for backwards compatibility: the "flip a fully-paid
 * GR to delivered" reconciliation now runs on the backend inside the
 * create/update/payment endpoints. Nothing on the device recalculates it.
 */
export const reconcileDeliveredStatus = async (): Promise<void> => {};

// ─────────────────────────────────────────────────────────────────────────────
// Types (unchanged public shapes)
// ─────────────────────────────────────────────────────────────────────────────

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
  /** Canonical reporting bucket: 'pending' | 'cleared' | 'uncleared' | 'delivered'.
   *  Derived server-side from delivery state + payments ledger — the single
   *  source of truth (backend `app/services/gr_status_service.py`). */
  status: string;
  createdAt: string;
  hasSlip: boolean;
  source: string;
  area: string | null;
  toPay: number;
  totalPaid: number;
  paymentAmount: number;
}

/** Canonical GR reporting counts (+ money totals) for a filtered dataset.
 *  Always satisfies pending + cleared + uncleared + delivered === total. */
export interface GRStatusCounts {
  total: number;
  pending: number;
  cleared: number;
  uncleared: number;
  delivered: number;
  totalToPay: number;
  totalReceived: number;
  totalOutstanding: number;
}

export interface LocalAttachment {
  id: string;
  originalFilename: string;
  mimeType: string;
  createdAt: string;
  url: string;
}

export interface LocalTimelineEvent {
  id: string;
  status: string;
  note: string | null;
  createdAt: string;
}

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
  slipData?: string;
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
  paymentAmount?: number;
}

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

export interface ShopCount {
  name: string;
  grCount: number;
}

export interface StaffDailyGR {
  orderId: string;
  orderNumber: string;
  consignorName: string | null;
  consigneeName: string | null;
  status: string;
  amountCollected: number;
}

export interface StaffActivityEvent {
  id: string;
  kind: 'collected' | 'delivered' | 'payment';
  orderId: string;
  orderNumber: string;
  consignorName: string | null;
  consigneeName: string | null;
  createdAt: string;
  amount?: number;
  remaining?: number;
  toPay?: number;
}

export interface StaffWorkGR {
  orderId: string;
  orderNumber: string;
  consignorName: string | null;
  consigneeName: string | null;
  status: string;
  collectedAt: string;
  deliveredAt: string | null;
  toPay: number;
  totalPaid: number;
  balance: number;
}

export interface StaffDailySummary {
  grCollected: number;
  grDelivered: number;
  amountCollected: number;
  amountPending: number;
  totalBillValue: number;
  shopsVisited: number;
  ownerAmount: number;
  labourAmount: number;
  driverAmount: number;
  staffBalance: number;
}

export interface StaffDailyActivity {
  summary: StaffDailySummary;
  timeline: StaffActivityEvent[];
  grWork: StaffWorkGR[];
  payments: StaffActivityEvent[];
  settlements: CollectionTransaction[];
}

export type SettlementType = 'owner' | 'labour' | 'driver';

export interface CollectionTransaction {
  id: string;
  kind: 'collection' | SettlementType;
  amount: number;
  orderId?: string;
  orderNumber?: string;
  consignorName?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface StaffDailyCollection {
  date: string;
  totalCollection: number;
  ownerAmount: number;
  labourAmount: number;
  driverAmount: number;
  staffBalance: number;
  transactions: CollectionTransaction[];
}

export interface GRListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
  area?: string;
  consignor?: string;
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

export interface ActivityEvent {
  id: string;
  kind: 'created' | 'status' | 'upload';
  orderId: string;
  orderNumber: string;
  status?: string;
  previousStatus?: string | null;
  createdAt: string;
}

export interface LocalPayment {
  id: string;
  orderId: string;
  amount: number;
  paymentMethod: string | null;
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
}

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
  paymentStatus: string;
  paymentCount: number;
  createdAt: string;
}

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

export interface PaymentSummary {
  orderId: string;
  orderNumber: string;
  toPay: number;
  totalPaid: number;
  balance: number;
  paymentStatus: string;
  paymentCount: number;
  payments: LocalPayment[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Response mappers (GROut → Local* shapes the screens expect)
// ─────────────────────────────────────────────────────────────────────────────

const parseSlipData = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const pickExtended = (g: any): GRExtendedFields => {
  const out: GRExtendedFields = {};
  for (const k of EXTENDED_FIELD_KEYS) {
    const v = g[k];
    if (v !== null && v !== undefined) (out as any)[k] = v;
  }
  return out;
};

const mapListItem = (r: any): LocalGRListItem => ({
  id: r.id,
  orderNumber: r.orderNumber,
  consignorName: r.consignorName ?? null,
  consigneeName: r.consigneeName ?? null,
  pickupAddress: r.pickupAddress,
  deliveryAddress: r.deliveryAddress,
  driverId: r.driverId ?? null,
  assignedStaffId: r.assignedStaffId ?? null,
  // Prefer the canonical reporting bucket; fall back to raw status for any
  // older response shape.
  status: r.reportingStatus ?? r.status,
  createdAt: r.createdAt,
  hasSlip: Boolean(r.hasSlip),
  source: r.source ?? 'manual',
  area: r.area ?? null,
  toPay: Number(r.toPay ?? 0),
  totalPaid: Number(r.totalPaid ?? r.paymentAmount ?? 0),
  paymentAmount: Number(r.paymentAmount ?? 0),
});

const mapAttachment = (a: any): LocalAttachment => ({
  id: a.id,
  originalFilename: a.originalFilename,
  mimeType: a.mimeType,
  createdAt: a.createdAt,
  url: a.url ?? '',
});

const mapTimeline = (t: any): LocalTimelineEvent => ({
  id: t.id,
  status: t.status,
  note: t.note ?? null,
  createdAt: t.createdAt,
});

const mapDetail = (g: any): LocalGRDetail => ({
  id: g.id,
  orderNumber: g.orderNumber,
  status: g.status,
  trackingCode: g.trackingCode ?? null,
  pickupAddress: g.pickupAddress,
  deliveryAddress: g.deliveryAddress,
  consignorName: g.consignorName ?? null,
  consigneeName: g.consigneeName ?? null,
  particulars: g.particulars ?? null,
  packageCount: g.packageCount ?? null,
  weight: g.weight ?? null,
  notes: g.notes ?? null,
  driverId: g.driverId ?? null,
  assignedStaffId: g.assignedStaffId ?? null,
  createdAt: g.createdAt,
  paymentAmount: g.paymentAmount ?? null,
  slipData: parseSlipData(g.slipData),
  attachments: (g.attachments ?? []).map(mapAttachment),
  timeline: (g.timeline ?? []).map(mapTimeline),
  source: g.source ?? 'manual',
  area: g.area ?? null,
  ...pickExtended(g),
});

const buildCreatePayload = (input: GRCreateInput): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    grNumber: input.grNumber,
    consignorName: input.consignorName,
    consigneeName: input.consigneeName,
    pickupAddress: input.pickupAddress,
    deliveryAddress: input.deliveryAddress,
    pickupTime: input.pickupTime,
  };
  if (input.companyId) payload.companyId = input.companyId;
  if (input.particulars !== undefined) payload.particulars = input.particulars;
  if (input.packageCount !== undefined) payload.packageCount = input.packageCount;
  if (input.weight !== undefined) payload.weight = input.weight;
  if (input.trackingCode !== undefined) payload.trackingCode = input.trackingCode;
  if (input.notes !== undefined) payload.notes = input.notes;
  if (input.slipData !== undefined) payload.slipData = input.slipData;
  if (input.source !== undefined) payload.source = input.source;
  for (const k of EXTENDED_FIELD_KEYS) {
    if (input[k] !== undefined) payload[k] = input[k];
  }
  return payload;
};

// ─────────────────────────────────────────────────────────────────────────────
// Repository
// ─────────────────────────────────────────────────────────────────────────────

export const orderRepository = {
  async list(params: GRListParams = {}): Promise<GRListResult> {
    const query: Record<string, unknown> = {
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
    };
    if (params.status) query.status = params.status;
    if (params.search) query.search = params.search;
    if (params.area) query.area = params.area;
    if (params.consignor) query.consignor = params.consignor;
    const res = await api.get(ENDPOINTS.admin.orders.list, {
      params: query,
      timeout: ENV.ordersListTimeoutMs,
    });
    const data = body<{ items: any[]; total: number }>(res);
    let items = data.items.map(mapListItem);
    // The GR list's "Date Range" filter (Today/Week/Month) — backend list has
    // no dateFrom param, so apply it client-side over the returned page.
    if (params.dateFrom) {
      items = items.filter((i) => i.createdAt >= params.dateFrom!);
    }
    return { items, total: data.total };
  },

  /**
   * Fetches every GR matching the given filters by paging through the
   * backend in chunks of 100 (the server-enforced `page_size` cap — see
   * `list_grs` in `backend/app/api/v1/gr.py`). Used by screens that need the
   * full matching set client-side (summary counts, payment aggregation)
   * instead of a single page.
   */
  async listAll(params: Omit<GRListParams, 'page' | 'pageSize'> = {}): Promise<GRListResult> {
    const pageSize = 100;
    let page = 1;
    let items: LocalGRListItem[] = [];
    let total = 0;
    for (;;) {
      const res = await this.list({ ...params, page, pageSize });
      items = items.concat(res.items);
      total = res.total;
      if (res.items.length < pageSize || items.length >= total) break;
      page += 1;
    }
    return { items, total };
  },

  /**
   * Canonical GR reporting counts (pending / cleared / uncleared / delivered)
   * + money totals for the given filters, computed by a single server-side
   * aggregate query over Neon (`GET /admin/orders/meta/status-counts`).
   *
   * This is the ONE source both the Admin Dashboard status overview and the
   * GR / Shipments summary cards consume — neither screen classifies GRs
   * itself. Guaranteed: pending + cleared + uncleared + delivered === total.
   */
  async getStatusCounts(params: {
    search?: string;
    area?: string;
    consignor?: string;
    dateFrom?: string;
  } = {}): Promise<GRStatusCounts> {
    const query: Record<string, unknown> = {};
    if (params.search) query.search = params.search;
    if (params.area) query.area = params.area;
    if (params.consignor) query.consignor = params.consignor;
    if (params.dateFrom) query.dateFrom = params.dateFrom;
    const res = await api.get(ENDPOINTS.admin.orders.statusCounts, { params: query });
    const d = body<Partial<GRStatusCounts>>(res);
    return {
      total: Number(d.total ?? 0),
      pending: Number(d.pending ?? 0),
      cleared: Number(d.cleared ?? 0),
      uncleared: Number(d.uncleared ?? 0),
      delivered: Number(d.delivered ?? 0),
      totalToPay: Number(d.totalToPay ?? 0),
      totalReceived: Number(d.totalReceived ?? 0),
      totalOutstanding: Number(d.totalOutstanding ?? 0),
    };
  },

  /**
   * Distinct shop names for the "Shop Owner" filter dropdown. The shop
   * identity is the GR's **consignee** (not the consignor); the backend
   * endpoint keeps its historical `/meta/consignors` path but now returns
   * normalized, de-duplicated consignee names.
   */
  async getDistinctConsignors(area?: string): Promise<string[]> {
    const res = await api.get(ENDPOINTS.admin.orders.consignors, {
      params: area ? { area } : undefined,
    });
    return body<string[]>(res);
  },

  async getById(id: string): Promise<LocalGRDetail | null> {
    try {
      const res = await api.get(ENDPOINTS.admin.orders.detail(id));
      return mapDetail(body<any>(res));
    } catch (err: any) {
      if (err?.response?.status === 404) return null;
      throw err;
    }
  },

  async getByOrderNumber(orderNumber: string): Promise<LocalGRDetail | null> {
    try {
      const res = await api.get(ENDPOINTS.admin.orders.track(orderNumber));
      return mapDetail(body<any>(res));
    } catch (err: any) {
      if (err?.response?.status === 404) return null;
      throw err;
    }
  },

  /** Back-compat helper — detail already carries attachments + timeline. */
  async hydrateDetail(row: any): Promise<LocalGRDetail> {
    return mapDetail(row);
  },

  async create(input: GRCreateInput): Promise<LocalGRDetail> {
    return withApiError(async () => {
      const res = await api.post(ENDPOINTS.admin.orders.create, buildCreatePayload(input));
      return mapDetail(body<any>(res));
    });
  },

  async update(id: string, input: GRUpdateInput): Promise<LocalGRDetail | null> {
    const payload: Record<string, unknown> = {};
    const keys: (keyof GRUpdateInput)[] = [
      'consignorName', 'consigneeName', 'particulars', 'pickupAddress',
      'deliveryAddress', 'pickupTime', 'packageCount', 'weight', 'notes',
      'paymentAmount', ...EXTENDED_FIELD_KEYS,
    ];
    for (const k of keys) {
      if (input[k] !== undefined) payload[k] = input[k];
    }
    if (Object.keys(payload).length === 0) return this.getById(id);
    return withApiError(async () => {
      const res = await api.patch(ENDPOINTS.admin.orders.update(id), payload);
      return mapDetail(body<any>(res));
    });
  },

  async delete(id: string): Promise<void> {
    await api.delete(ENDPOINTS.admin.orders.remove(id));
  },

  /** Admin-only bulk delete of every GR in the caller's company scope —
   * one backend request, one DB statement (see `DELETE /admin/orders`).
   * Never loops per-GR delete calls. Returns how many GRs were deleted. */
  async deleteAll(): Promise<number> {
    return withApiError(async () => {
      const res = await api.delete(ENDPOINTS.admin.orders.removeAll);
      return body<{ deletedCount: number }>(res).deletedCount ?? 0;
    });
  },

  async updateStatus(id: string, status: string): Promise<LocalGRDetail | null> {
    await api.patch(ENDPOINTS.admin.orders.updateStatus(id), { status });
    return this.getById(id);
  },

  async assignDriver(id: string, driverId: string): Promise<LocalGRDetail | null> {
    await api.post(ENDPOINTS.admin.orders.assignDriver(id), { driverId });
    return this.getById(id);
  },

  async assignStaff(id: string, staffId: string): Promise<LocalGRDetail | null> {
    await api.post(ENDPOINTS.admin.orders.assignStaff(id), { staffId });
    return this.getById(id);
  },

  async remove(id: string): Promise<void> {
    await api.delete(ENDPOINTS.admin.orders.remove(id));
  },

  async addAttachment(
    orderId: string,
    attachment: { originalFilename: string; mimeType: string; localUri: string; fileSizeBytes?: number }
  ): Promise<LocalAttachment | null> {
    const form = new FormData();
    form.append('file', {
      uri: attachment.localUri,
      name: attachment.originalFilename,
      type: attachment.mimeType,
    } as any);
    const res = await api.post(ENDPOINTS.admin.orders.attachments(orderId), form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return mapAttachment(body<any>(res));
  },

  async listRecentActivity(limit = 10): Promise<ActivityEvent[]> {
    const res = await api.get(ENDPOINTS.admin.orders.activity, { params: { limit } });
    return body<ActivityEvent[]>(res);
  },

  // ---- Lookup tables (GR pickers). Fetched live from the backend; the
  //      former on-device cache tables are gone. `upsert*` are retained as
  //      no-ops so any residual callers keep compiling. ----

  async listCompanies(): Promise<PickerRow[]> {
    try {
      const res = await api.get(ENDPOINTS.admin.companies, { params: { page_size: 100 } });
      const items = body<{ items?: any[] }>(res).items ?? [];
      return items.map((c: any) => ({ id: c.id, name: c.name }));
    } catch {
      return [];
    }
  },
  async upsertCompanies(): Promise<void> {},

  async listDrivers(): Promise<PickerRow[]> {
    try {
      const res = await api.get(ENDPOINTS.admin.drivers, { params: { page_size: 100 } });
      const items = body<{ items?: any[] }>(res).items ?? [];
      return items.map((d: any) => ({ id: d.id, name: d.fullName ?? d.name }));
    } catch {
      return [];
    }
  },
  async upsertDrivers(): Promise<void> {},

  async listStaff(): Promise<PickerRow[]> {
    try {
      const res = await api.get(ENDPOINTS.admin.users, { params: { page_size: 100, role: 'employee' } });
      const items = body<{ items?: any[] }>(res).items ?? [];
      return items.map((u: any) => ({
        id: u.id,
        name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.fullName || u.email,
      }));
    } catch {
      return [];
    }
  },
  async upsertStaff(): Promise<void> {},

  // ---- Payments ----

  async addPayment(input: {
    orderId: string;
    amount: number;
    paymentMethod?: string;
    notes?: string;
    recordedBy?: string;
  }): Promise<LocalPayment> {
    return withApiError(async () => {
      const res = await api.post(ENDPOINTS.payments.create, {
        orderId: input.orderId,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        notes: input.notes,
        recordedBy: input.recordedBy,
      });
      const p = body<any>(res);
      return {
        id: p.id,
        orderId: p.orderId,
        amount: Number(p.amount),
        paymentMethod: p.paymentMethod ?? null,
        notes: p.notes ?? null,
        recordedBy: p.recordedBy ?? null,
        createdAt: p.createdAt,
      };
    });
  },

  async listPayments(orderId: string): Promise<LocalPayment[]> {
    const res = await api.get(ENDPOINTS.payments.listByOrder(orderId));
    const rows = body<any[]>(res);
    return rows.map((p) => ({
      id: p.id,
      orderId: p.orderId,
      amount: Number(p.amount),
      paymentMethod: p.paymentMethod ?? null,
      notes: p.notes ?? null,
      recordedBy: p.recordedBy ?? null,
      createdAt: p.createdAt,
    }));
  },

  async getPaymentSummary(orderId: string): Promise<PaymentSummary | null> {
    try {
      const res = await api.get(ENDPOINTS.payments.summary(orderId));
      const s = body<any>(res);
      return {
        orderId: s.orderId,
        orderNumber: s.orderNumber,
        toPay: Number(s.toPay ?? 0),
        totalPaid: Number(s.totalPaid ?? 0),
        balance: Number(s.balance ?? 0),
        paymentStatus: s.paymentStatus,
        paymentCount: Number(s.paymentCount ?? 0),
        payments: (s.payments ?? []).map((p: any) => ({
          id: p.id,
          orderId: p.orderId,
          amount: Number(p.amount),
          paymentMethod: p.paymentMethod ?? null,
          notes: p.notes ?? null,
          recordedBy: p.recordedBy ?? null,
          createdAt: p.createdAt,
        })),
      };
    } catch (err: any) {
      if (err?.response?.status === 404) return null;
      throw err;
    }
  },

  async getRevenueOverview() {
    const res = await api.get(ENDPOINTS.admin.orders.revenueOverview);
    const d = body<any>(res);
    return {
      today: Number(d.today ?? 0),
      yesterday: Number(d.yesterday ?? 0),
      week: Number(d.week ?? 0),
      prevWeek: Number(d.prevWeek ?? 0),
      month: Number(d.month ?? 0),
      prevMonth: Number(d.prevMonth ?? 0),
      totalCollected: Number(d.totalCollected ?? 0),
      outstandingAmount: Number(d.outstandingAmount ?? 0),
      collectedGRCount: Number(d.collectedGRCount ?? 0),
      outstandingGRCount: Number(d.outstandingGRCount ?? 0),
      collectedThisMonth: Number(d.collectedThisMonth ?? 0),
      collectedPrevMonth: Number(d.collectedPrevMonth ?? 0),
    };
  },

  async listReceiving(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    paymentStatus?: string;
    customerId?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}): Promise<{ items: ReceivingListItem[]; total: number }> {
    const query: Record<string, unknown> = {
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
    };
    if (params.search) query.search = params.search;
    if (params.paymentStatus) query.paymentStatus = params.paymentStatus;
    if (params.customerId) query.customerId = params.customerId;
    if (params.dateFrom) query.dateFrom = params.dateFrom;
    if (params.dateTo) query.dateTo = params.dateTo;
    const res = await api.get(ENDPOINTS.admin.orders.receiving, { params: query });
    const data = body<{ items: any[]; total: number }>(res);
    return {
      items: data.items.map((r) => ({
        id: r.id,
        orderNumber: r.orderNumber,
        consigneeName: r.consigneeName ?? null,
        consignorName: r.consignorName ?? null,
        pickupAddress: r.pickupAddress,
        deliveryAddress: r.deliveryAddress,
        grStatus: r.grStatus,
        toPay: Number(r.toPay ?? 0),
        totalPaid: Number(r.totalPaid ?? 0),
        balance: Number(r.balance ?? 0),
        paymentStatus: r.paymentStatus,
        paymentCount: Number(r.paymentCount ?? 0),
        createdAt: r.createdAt,
      })),
      total: data.total,
    };
  },

  async getReceivingOverview(): Promise<ReceivingOverview> {
    const res = await api.get(ENDPOINTS.admin.orders.receivingOverview);
    const d = body<any>(res);
    return {
      totalToPay: Number(d.totalToPay ?? 0),
      totalPaid: Number(d.totalPaid ?? 0),
      outstanding: Number(d.outstanding ?? 0),
      totalTransactions: Number(d.totalTransactions ?? 0),
      unpaidCount: Number(d.unpaidCount ?? 0),
      partialCount: Number(d.partialCount ?? 0),
      paidCount: Number(d.paidCount ?? 0),
      overpaidCount: Number(d.overpaidCount ?? 0),
      grCount: Number(d.grCount ?? 0),
    };
  },

  async getShopsOverview(): Promise<ShopSummary[]> {
    const res = await api.get(ENDPOINTS.admin.orders.shopsOverview);
    return body<any[]>(res).map((r) => ({
      area: r.area,
      total: Number(r.total ?? 0),
      pending: Number(r.pending ?? 0),
      cleared: Number(r.cleared ?? 0),
      uncleared: Number(r.uncleared ?? 0),
      delivered: Number(r.delivered ?? 0),
      totalToPay: Number(r.totalToPay ?? 0),
      totalCollected: Number(r.totalCollected ?? 0),
      outstanding: Number(r.outstanding ?? 0),
    }));
  },

  async getShopsWithCounts(search?: string, area?: string): Promise<ShopCount[]> {
    const params: Record<string, unknown> = {};
    if (search) params.search = search;
    if (area) params.area = area;
    const res = await api.get(ENDPOINTS.admin.orders.shopsCounts, { params });
    return body<any[]>(res).map((r) => ({ name: r.name, grCount: Number(r.grCount ?? 0) }));
  },

  // ---- Staff Daily Work ----

  async getStaffDailySummary(staffId: string, dateIso: string): Promise<{ totalCollection: number; totalGRs: number }> {
    const res = await api.get(ENDPOINTS.staffWork.dailySummary, {
      params: { staffId, date: dateIso },
    });
    const d = body<any>(res);
    return { totalCollection: Number(d.totalCollection ?? 0), totalGRs: Number(d.totalGRs ?? 0) };
  },

  async getStaffDailyGRs(staffId: string, dateIso: string): Promise<StaffDailyGR[]> {
    const res = await api.get(ENDPOINTS.staffWork.dailyGRs, {
      params: { staffId, date: dateIso },
    });
    return body<any[]>(res).map((r) => ({
      orderId: r.orderId,
      orderNumber: r.orderNumber,
      consignorName: r.consignorName ?? null,
      consigneeName: r.consigneeName ?? null,
      status: r.status,
      amountCollected: Number(r.amountCollected ?? 0),
    }));
  },

  async getTodayCollection(): Promise<number> {
    const res = await api.get(ENDPOINTS.admin.orders.todayCollection);
    return Number(body<number>(res) ?? 0);
  },

  async getStaffDailyActivity(staffId: string, dateIso: string): Promise<StaffDailyActivity> {
    const res = await api.get(ENDPOINTS.staffWork.dailyWork, {
      params: { staffId, date: dateIso },
    });
    return body<StaffDailyActivity>(res);
  },

  async getStaffSettlementTotals(
    staffId: string,
    dateIso: string
  ): Promise<{ owner: number; labour: number; driver: number; events: CollectionTransaction[] }> {
    const collection = await this.getStaffDailyCollection(staffId, dateIso);
    return {
      owner: collection.ownerAmount,
      labour: collection.labourAmount,
      driver: collection.driverAmount,
      events: collection.transactions.filter((t) => t.kind !== 'collection'),
    };
  },

  async getStaffDailyCollection(staffId: string, dateIso: string): Promise<StaffDailyCollection> {
    const res = await api.get(ENDPOINTS.staffWork.dailyCollection, {
      params: { staffId, date: dateIso },
    });
    const d = body<any>(res);
    return {
      date: d.date,
      totalCollection: Number(d.totalCollection ?? 0),
      ownerAmount: Number(d.ownerAmount ?? 0),
      labourAmount: Number(d.labourAmount ?? 0),
      driverAmount: Number(d.driverAmount ?? 0),
      staffBalance: Number(d.staffBalance ?? 0),
      transactions: (d.transactions ?? []).map((t: any) => ({
        id: t.id,
        kind: t.kind,
        amount: Number(t.amount ?? 0),
        orderId: t.orderId ?? undefined,
        orderNumber: t.orderNumber ?? undefined,
        consignorName: t.consignorName ?? null,
        notes: t.notes ?? null,
        createdAt: t.createdAt,
      })),
    };
  },

  async addStaffSettlement(input: {
    staffId: string;
    type: SettlementType;
    amount: number;
    notes?: string;
    createdBy?: string;
  }): Promise<void> {
    await withApiError(() =>
      api.post(ENDPOINTS.staffWork.settlements, {
        type: input.type,
        amount: input.amount,
        notes: input.notes,
        // Idempotency key so a network retry never double-records the handover.
        clientRequestId: uuid(),
      })
    );
  },
};
