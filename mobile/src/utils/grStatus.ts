/** Mirror of backend `gr_status_service.classify` — a delivered GR with
 * nothing left to pay is `cleared` (incl. toPay <= 0: nothing owed).
 * Used to patch local state instantly from a realtime `gr.status` event,
 * without waiting for the debounced authoritative refetch. */
export const classifyGrBucket = (
  rawStatus: string,
  toPay: number,
  totalPaid: number,
): 'pending' | 'cleared' | 'uncleared' | 'delivered' => {
  const EPS = 0.005;
  if (rawStatus === 'pending') return 'pending';
  if (toPay > 0) {
    if (totalPaid >= toPay - EPS) return 'cleared';
    if (totalPaid > 0) return 'uncleared';
    return 'delivered';
  }
  return 'cleared';
};
