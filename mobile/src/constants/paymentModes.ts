/** Fixed payment modes for the Receive Payment flow. Values are what gets
 * stored in `payments.paymentMethod` — matches the labels already defined
 * (but previously unused) under the `payment.*` i18n keys.
 *
 * "Other" was removed — "Admin" is not a payment method, it's WHO RECEIVED
 * the money (an orthogonal `receivedBy` toggle on the Receive Payment
 * screen), so it never belongs in this list. */
export const PAYMENT_MODES = [
  { value: 'cash', labelKey: 'payment.cash', label: 'Cash' },
  { value: 'upi', labelKey: 'payment.upi', label: 'UPI' },
  { value: 'bank_transfer', labelKey: 'payment.bankTransfer', label: 'Bank Transfer' },
  { value: 'cheque', labelKey: 'payment.cheque', label: 'Cheque' },
] as const;

export type PaymentMode = (typeof PAYMENT_MODES)[number]['value'];

const LABEL_BY_VALUE: Record<string, string> = Object.fromEntries(PAYMENT_MODES.map((m) => [m.value, m.label]));

/** Displays a stored payment method value, tolerant of legacy free-text
 * values (e.g. Excel-imported `paymentMode` strings that predate this fixed
 * list) by falling back to the raw value, title-cased. */
export const formatPaymentMode = (value: string | null | undefined): string => {
  if (!value) return '—';
  const known = LABEL_BY_VALUE[value.toLowerCase()];
  if (known) return known;
  return value.charAt(0).toUpperCase() + value.slice(1);
};

/** The 5 options shown on the Receive Payment screen. Each option is a
 * single choice that carries BOTH the payment method AND the receiver — the
 * payment mode itself now tells the system where the money went, so there is
 * no separate "Received By" selector. "Admin UPI"/"Staff UPI" both persist as
 * `paymentMethod: 'upi'` (unchanged storage value, so every existing UPI
 * consumer — dashboard cards, filters, exports — keeps working); only
 * `receivedBy` differs, reusing the existing STAFF/ADMIN accounting split.
 * Cash/Bank Transfer/Cheque keep their original behavior exactly —
 * `receivedBy: 'STAFF'` is the pre-existing default for those, not a new
 * distinction. */
export const RECEIVE_PAYMENT_OPTIONS = [
  { id: 'admin_upi', paymentMethod: 'upi', receivedBy: 'ADMIN', labelKey: 'payment.adminUpi', label: 'Admin UPI' },
  { id: 'staff_upi', paymentMethod: 'upi', receivedBy: 'STAFF', labelKey: 'payment.staffUpi', label: 'Staff UPI' },
  { id: 'cash', paymentMethod: 'cash', receivedBy: 'STAFF', labelKey: 'payment.cash', label: 'Cash' },
  { id: 'bank_transfer', paymentMethod: 'bank_transfer', receivedBy: 'STAFF', labelKey: 'payment.bankTransfer', label: 'Bank Transfer' },
  { id: 'cheque', paymentMethod: 'cheque', receivedBy: 'STAFF', labelKey: 'payment.cheque', label: 'Cheque' },
] as const;

export type ReceivePaymentOptionId = (typeof RECEIVE_PAYMENT_OPTIONS)[number]['id'];

/** Human-readable payment mode for display, distinguishing "Admin UPI" from
 * "Staff UPI" the same way the Receive Payment options do — everywhere else
 * (Cash/Bank Transfer/Cheque) this matches `formatPaymentMode` exactly. */
export const formatPaymentModeWithReceiver = (
  paymentMethod: string | null | undefined,
  receivedBy: string | null | undefined,
): string => {
  if ((paymentMethod ?? '').toLowerCase() === 'upi') {
    return receivedBy === 'ADMIN' ? 'Admin UPI' : 'Staff UPI';
  }
  return formatPaymentMode(paymentMethod);
};
