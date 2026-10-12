import { Order } from '../models/index.js';
import { ORDER_STATUS } from '../constants/enums.js';
import { emitOrderEvent } from '../socket/events.js';

export const EXPIRY_EVENTS = Object.freeze({
  EXPIRING: 'order:expiring', // ready dose expires within the warning window
  EXPIRED: 'order:expired',   // ready dose passed its beyond-use time
});

const WARN_MINUTES = Number(process.env.EXPIRY_WARN_MINUTES) || 60;
const INTERVAL_MS = 60 * 1000; // check every minute

const SUMMARY_FIELDS = 'orderNumber hospital department departmentCode patient.mrn patient.name drugSnapshot dose status readyAt expiresAt';

/**
 * Claims the alert atomically: only the first server to set the flag sends it.
 * Returns true if this call claimed it.
 */
async function claim(orderId, flag, now) {
  const res = await Order.updateOne(
    { _id: orderId, status: ORDER_STATUS.READY, [`expiryAlerts.${flag}`]: { $exists: false } },
    { $set: { [`expiryAlerts.${flag}`]: now } }
  );
  return res.modifiedCount === 1;
}

/** One pass: find ready doses that are expiring/expired and alert once per stage. */
export async function checkExpiries(now = new Date()) {
  const warnUntil = new Date(now.getTime() + WARN_MINUTES * 60 * 1000);

  const candidates = await Order.find({
    status: ORDER_STATUS.READY,
    expiresAt: { $lte: warnUntil },
    'expiryAlerts.expiredAt': { $exists: false },
  })
    .select(`${SUMMARY_FIELDS} expiryAlerts`)
    .lean();

  let warned = 0;
  let expired = 0;

  for (const order of candidates) {
    const isExpired = order.expiresAt <= now;
    const minutesToExpiry = Math.round((order.expiresAt - now) / 60000);
    const payload = { ...order, minutesToExpiry, isExpired };
    delete payload.expiryAlerts;

    if (isExpired) {
      if (await claim(order._id, 'expiredAt', now)) {
        emitOrderEvent(EXPIRY_EVENTS.EXPIRED, payload);
        expired += 1;
      }
    } else if (!order.expiryAlerts?.warnedAt) {
      if (await claim(order._id, 'warnedAt', now)) {
        emitOrderEvent(EXPIRY_EVENTS.EXPIRING, payload);
        warned += 1;
      }
    }
  }

  return { warned, expired };
}

/** Starts the background loop. Returns a stop() function. */
export function startExpiryWatcher() {
  let running = false;

  const tick = async () => {
    if (running) return; // never overlap two passes
    running = true;
    try {
      const { warned, expired } = await checkExpiries();
      if (warned || expired) console.log(`[expiry] alerts sent: ${warned} expiring, ${expired} expired`);
    } catch (err) {
      console.error('[expiry] check failed:', err.message); // keep the loop alive
    } finally {
      running = false;
    }
  };

  tick();
  const timer = setInterval(tick, INTERVAL_MS);
  timer.unref(); // don't keep the process alive just for this
  console.log(`[expiry] watcher started (warn ${WARN_MINUTES} min before expiry)`);
  return () => clearInterval(timer);
}