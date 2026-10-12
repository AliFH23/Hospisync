import { Hospital } from '../models/index.js';
import { aiEnabled, getStockRecommendations } from '../services/aiClient.js';
import { getIO, rooms } from '../socket/index.js';

export const AI_STOCK_EVENT = 'ai:stock-alert';

const INTERVAL_MS = (Number(process.env.STOCK_ADVISOR_MINUTES) || 30) * 60 * 1000;

// Last status we alerted per hospital+drug, so we only alert on CHANGES.
// In memory: after a restart, current non-ok drugs are announced once again (acceptable).
const lastStatus = new Map();

/** One pass over all active hospitals. Returns how many alerts were sent. */
export async function checkStock() {
  const hospitals = await Hospital.find({ isActive: true }).select('code').lean();
  let sent = 0;

  for (const h of hospitals) {
    const data = await getStockRecommendations(h.code);

    for (const item of data.items) {
      const key = `${h._id}:${item.drugId}`;
      const previous = lastStatus.get(key) ?? 'ok';
      lastStatus.set(key, item.status);

      // Alert only when a drug gets worse or first becomes a problem
      const worse = { ok: 0, reorder: 1, critical: 2 };
      if (worse[item.status] > worse[previous]) {
        getIO()?.to(rooms.pharmacy(h._id)).emit(AI_STOCK_EVENT, {
          ...item,
          previousStatus: previous,
          leadTimeDays: data.leadTimeDays,
          at: new Date().toISOString(),
        });
        sent += 1;
      }
    }
  }
  return sent;
}

/** Starts the loop. AI being down never affects the rest of the server. */
export function startStockAdvisor() {
  if (!aiEnabled()) {
    console.log('[ai] AI_SERVICE_URL / AI_INTERNAL_KEY not set: stock advisor disabled');
    return () => {};
  }

  let running = false;
  let lastErrorLogged = 0;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const sent = await checkStock();
      if (sent) console.log(`[ai] stock alerts sent: ${sent}`);
    } catch (err) {
      // Log at most once every 10 min so a stopped AI service doesn't flood the console
      if (Date.now() - lastErrorLogged > 10 * 60 * 1000) {
        console.warn(`[ai] stock check skipped: ${err.message}`);
        lastErrorLogged = Date.now();
      }
    } finally {
      running = false;
    }
  };

  setTimeout(tick, 5000).unref(); // first check shortly after startup
  const timer = setInterval(tick, INTERVAL_MS);
  timer.unref();
  console.log(`[ai] stock advisor started (every ${INTERVAL_MS / 60000} min)`);
  return () => clearInterval(timer);
}
