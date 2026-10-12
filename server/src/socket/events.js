import { getIO, rooms } from './index.js';

// Event names shared with the frontend
export const EVENTS = Object.freeze({
  ORDER_CREATED: 'order:created',
  ORDER_UPDATED: 'order:updated',
  STOCK_LOW: 'stock:low',
});

/**
 * Sends an order event to everyone who should see it:
 * the pharmacy of that hospital + the nurses of the ordering ward.
 * Call ONLY after the database transaction has committed,
 * so screens never show a change that was rolled back.
 */
export function emitOrderEvent(event, order) {
  const io = getIO();
  if (!io) return; // Socket.io not started (e.g. tests, seed script)

  const payload = { ...order };
  delete payload.statusHistory; // detail endpoint only, keeps messages small

  io.to(rooms.pharmacy(order.hospital))
    .to(rooms.department(order.department))
    .emit(event, payload);
}

// Low-stock warning goes to the pharmacy only
export function emitLowStock(hospitalId, stock) {
  const io = getIO();
  if (!io) return;
  io.to(rooms.pharmacy(hospitalId)).emit(EVENTS.STOCK_LOW, stock);
}