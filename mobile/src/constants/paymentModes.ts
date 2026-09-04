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
