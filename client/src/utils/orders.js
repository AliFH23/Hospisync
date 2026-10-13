export const ACTIVE = ['pending', 'preparing', 'ready'];
const RANK = { emergency: 1, urgent: 2, routine: 3 };

/** Time flags recomputed on the client every tick (server values go stale). */
export function withFlags(o, now) {
  const toDeadline = (new Date(o.requiredBy).getTime() - now) / 60000;
  const toExpiry = o.expiresAt ? (new Date(o.expiresAt).getTime() - now) / 60000 : null;
  const ready = o.status === 'ready';
  return {
    ...o,
    minutesToDeadline: Math.round(toDeadline),
    isOverdue: ACTIVE.includes(o.status) && toDeadline < 0,
    minutesToExpiry: ready && toExpiry != null ? Math.round(toExpiry) : null,
    isExpired: ready && toExpiry != null && toExpiry <= 0,
    expiringSoon: ready && toExpiry != null && toExpiry > 0 && toExpiry <= 60,
  };
}

/** Queue order: emergency first, then earliest deadline. */
export const byPriority = (a, b) =>
  (RANK[a.priority] - RANK[b.priority]) || (new Date(a.requiredBy) - new Date(b.requiredBy));

/** "−5 min", "12 min", "3 h 50 min" (always Western digits) */
/** Compact so it never wraps: "−5 min", "3h 50m", "1d 11h" (always Western digits) */
export function formatMinutes(min) {
  const sign = min < 0 ? '−' : '';
  const m = Math.abs(min);
  if (m < 60) return `${sign}${m} min`;
  if (m < 1440) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return `${sign}${h}h${r ? ` ${r}m` : ''}`;
  }
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return `${sign}${d}d${h ? ` ${h}h` : ''}`;
}

export const shortId = (orderNumber) => `…${orderNumber.slice(-6)}`;