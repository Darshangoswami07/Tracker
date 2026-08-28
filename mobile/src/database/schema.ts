/**
 * Local-first SQLite schema.
 *
 * Business data that previously lived on the FastAPI/Postgres backend is
 * stored on-device in `deliveryhub.db`. The Neon/Postgres control plane
 * (admins, OTP, devices, licenses) is unchanged; only business reads/writes
 * (GR/orders, plus the lookup tables that drive GR pickers) move here.
 *
 * Column names mirror `backend/app/models/order.py` so that a future online
 * sync can map rows 1:1 without transformation.
 */
export const SCHEMA_VERSION = 10;

/**
 * DDL executed against a fresh database (user_version == 0). Kept as a plain
 * string (schema is static, no user input) — all parameterised queries go
 * through prepared statements in the repositories.
 */
export const CREATE_SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- GR / order records (the heart of the logistics platform).
CREATE TABLE IF NOT EXISTS orders (
  id                 TEXT PRIMARY KEY NOT NULL,
  orderNumber        TEXT NOT NULL UNIQUE,
  companyId          TEXT,
  customerId         TEXT,
  driverId           TEXT,
  vehicleId          TEXT,
  assignedStaffId    TEXT,
  consignorName      TEXT,
  consigneeName      TEXT,
  particulars        TEXT,
  packageCount       INTEGER,
  pickupAddress      TEXT NOT NULL,
  deliveryAddress    TEXT NOT NULL,
  pickupTime         TEXT,
  deliveryTime       TEXT,
  distance           REAL NOT NULL DEFAULT 0,
  weight             REAL,
  dimensions         TEXT,
  priority           TEXT NOT NULL DEFAULT 'normal',
  status             TEXT NOT NULL DEFAULT 'pending',
  currentLocation    TEXT,
  notes              TEXT,
  proofOfDeliveryUrl TEXT,
  paymentStatus      TEXT,
  paymentAmount      REAL,
  isActive           INTEGER NOT NULL DEFAULT 1,
  trackingCode       TEXT,
  hasSlip            INTEGER NOT NULL DEFAULT 0,
  -- JSON snapshot of the OCR-extracted slip fields (added in v2 via migration
  -- for installs that predate it; fresh databases get it inline below).
  slipData           TEXT,
  -- Extended GR/slip fields (added in v3 via migration for installs that
  -- predate it; fresh databases get them inline below). Mirrors the same
  -- additions in backend/app/models/order.py.
  grDate                TEXT,
  transportCompanyName  TEXT,
  transportGstin        TEXT,
  ewbNumber              TEXT,
  billType               TEXT,
  specialService         TEXT,
  fromLocation           TEXT,
  toLocation             TEXT,
  deliveryAt             TEXT,
  rate                   REAL,
  goodsValue             REAL,
  grCharge               REAL,
  freight                REAL,
  labour                 REAL,
  pf                     REAL,
  doorDelivery           REAL,
  taxGst                 REAL,
  netAmount              REAL,
  toPay                  REAL,
  proprietorName         TEXT,
  proprietorPhone        TEXT,
  packageType            TEXT,
  consignorGstin         TEXT,
  consignorPhone         TEXT,
  consigneeGstin         TEXT,
  consigneePhone         TEXT,
  -- Excel bulk-import fields (added in v6 via migration for installs that
  -- predate it; fresh databases get them inline below). source tracks how
  -- a GR was created (manual / slip / excel) so the GR list/detail
  -- screens can show a subtle origin indicator.
  source                  TEXT NOT NULL DEFAULT 'manual',
  chalaanNo               TEXT,
  chalaanDate             TEXT,
  transportGrn            TEXT,
  paymentMode             TEXT,
  grSourceLabel           TEXT,
  -- Area assignment (added in v9 via migration). Stores the area name
   -- (e.g. "Bageshwar", "Almora", "Garur Someshwar") to scope staff
  -- access to GRs from their assigned region.
  area                    TEXT,
  createdAt          TEXT NOT NULL,
  updatedAt          TEXT NOT NULL,
  isDeleted          INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_createdAt ON orders(createdAt);
CREATE INDEX IF NOT EXISTS idx_orders_driverId ON orders(driverId);
CREATE INDEX IF NOT EXISTS idx_orders_staffId ON orders(assignedStaffId);
CREATE INDEX IF NOT EXISTS idx_orders_area ON orders(area);

-- Payment records: individual payments against GR/Orders.
CREATE TABLE IF NOT EXISTS payments (
  id              TEXT PRIMARY KEY NOT NULL,
  orderId         TEXT NOT NULL,
  amount          REAL NOT NULL,
  paymentMethod   TEXT,
  notes           TEXT,
  recordedBy      TEXT,
  createdAt       TEXT NOT NULL,
  FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payments_orderId ON payments(orderId);

-- Status history (each transition appended when the status changes).
CREATE TABLE IF NOT EXISTS order_status_history (
  id        TEXT PRIMARY KEY NOT NULL,
  orderId   TEXT NOT NULL,
  status    TEXT NOT NULL,
  note      TEXT,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_status_history_orderId ON order_status_history(orderId);

-- Attachments (slip photos). Local file URI kept when the image is captured
-- offline; remoteUrl is populated once it is uploaded to the control plane.
CREATE TABLE IF NOT EXISTS order_attachments (
  id               TEXT PRIMARY KEY NOT NULL,
  orderId          TEXT NOT NULL,
  fileKind         TEXT NOT NULL DEFAULT 'generic',
  originalFilename TEXT NOT NULL,
  mimeType         TEXT NOT NULL,
  fileSizeBytes    INTEGER NOT NULL DEFAULT 0,
  localUri         TEXT,
  remoteUrl        TEXT,
  createdAt        TEXT NOT NULL,
  FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE
);

-- Lookup tables that feed the GR pickers (companies, drivers, staff).
-- Seeded from the control plane when online and cached for offline use.
CREATE TABLE IF NOT EXISTS companies (
  id   TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drivers (
  id       TEXT PRIMARY KEY NOT NULL,
  fullName TEXT NOT NULL,
  phone    TEXT
);

CREATE TABLE IF NOT EXISTS employees (
  id    TEXT PRIMARY KEY NOT NULL,
  name  TEXT NOT NULL,
  email TEXT
);

-- Key/value metadata (e.g. last successful sync time).
CREATE TABLE IF NOT EXISTS sync_meta (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT
);

-- Excel bulk-import run log (added in v6 via migration for installs that
-- predate it; fresh databases get it inline here so a version-0 install
-- doesn't skip straight to SCHEMA_VERSION without ever creating it).
    CREATE TABLE IF NOT EXISTS import_history (
      id              TEXT PRIMARY KEY NOT NULL,
      fileName        TEXT NOT NULL,
      importedAt      TEXT NOT NULL,
      importedByName  TEXT,
      area            TEXT,
      totalRows       INTEGER NOT NULL DEFAULT 0,
      importedRows    INTEGER NOT NULL DEFAULT 0,
      duplicateRows   INTEGER NOT NULL DEFAULT 0,
      failedRows      INTEGER NOT NULL DEFAULT 0
    );
`;

export const DROP_SCHEMA_SQL = `
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS import_history;
DROP TABLE IF EXISTS order_attachments;
DROP TABLE IF EXISTS order_status_history;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS drivers;
DROP TABLE IF EXISTS companies;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS sync_meta;
`;