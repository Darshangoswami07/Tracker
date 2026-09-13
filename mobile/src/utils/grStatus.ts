/** Mirror of backend `gr_status_service.classify` — a delivered GR with
 * nothing left to pay is `cleared` (incl. toPay <= 0: nothing owed).
 * Used to patch local state instantly from a realtime `gr.status` event,
 * without waiting for the debounced authoritative refetch.
 *
 * `discountAmount` (optional, defaults to 0) mirrors the backend's
 * `effective_to_pay` — an Admin Discount is subtracted from `toPay` here
 * too, so an optimistic realtime update never disagrees with the
 * backend-computed bucket once the refetch lands. */
export const classifyGrBucket = (
  rawStatus: string,
  toPay: number,
  totalPaid: number,
  discountAmount: number = 0,
): 'pending' | 'cleared' | 'uncleared' | 'delivered' => {
  const EPS = 0.005;
  if (rawStatus === 'pending') return 'pending';
  const effectiveToPay = Math.max(0, toPay - (discountAmount || 0));
  if (effectiveToPay > 0) {
    if (totalPaid >= effectiveToPay - EPS) return 'cleared';
    if (totalPaid > 0) return 'uncleared';
    return 'delivered';
  }
  return 'cleared';
};
