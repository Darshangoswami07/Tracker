export type GRStatus =
  | 'pending'
  | 'cleared'
  | 'uncleared'
  | 'delivered';

export interface OrderAttachment {
  id: string;
  orderId: string;
  fileKind: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedBy: string;
  createdAt: string;
  url: string;
}

export interface GR {
  id: string;
  orderNumber: string;
  companyId: string;
  customerId: string | null;
  driverId: string | null;
  vehicleId: string | null;
  assignedStaffId: string | null;
  pickupAddress: string;
  deliveryAddress: string;
  pickupTime: string;
  deliveryTime: string | null;
  consignorName: string | null;
  consigneeName: string | null;
  particulars: string | null;
  packageCount: number | null;
  weight: number | null;
  status: GRStatus;
  /** Canonical reporting bucket (pending/cleared/uncleared/delivered) — a
   *  delivered GR with nothing left to pay reads as `cleared`. `status` above
   *  stays the raw workflow flag. */
  reportingStatus?: GRStatus | null;
  notes: string | null;
  trackingCode: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: OrderAttachment[];
}

export interface GRListItem {
  id: string;
  orderNumber: string;
  consignorName: string | null;
  consigneeName: string | null;
  pickupAddress: string;
  deliveryAddress: string;
  driverId: string | null;
  assignedStaffId: string | null;
  status: GRStatus;
  reportingStatus?: GRStatus | null;
  createdAt: string;
  hasSlip: boolean;
}

export interface GRListResponse {
  items: GRListItem[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface GRCreateInput {
  grNumber: string;
  companyId: string;
  pickupAddress: string;
  deliveryAddress: string;
  pickupTime: string;
  consignorName: string;
  consigneeName: string;
  particulars?: string;
  packageCount?: number;
  weight?: number;
  notes?: string;
}
