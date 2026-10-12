// Dev tool: log in as a user and print every real-time event they receive.
// Usage: node scripts/listen.js <email> [password]
// Example: node scripts/listen.js pharmacist1@hospisync.dev

import { io } from 'socket.io-client';

const API = process.env.API_URL || 'http://localhost:5000';
const [email, password = 'Hospisync@2026'] = process.argv.slice(2);

if (!email) {
  console.error('Usage: node scripts/listen.js <email> [password]');
  process.exit(1);
}

const res = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const login = await res.json();
if (!login.success) {
  console.error('Login failed:', login.message);
  process.exit(1);
}

const time = () => new Date().toLocaleTimeString();
const socket = io(API, { auth: { token: login.token } });

socket.on('connect_error', (err) => console.error('Connection refused:', err.message));
socket.on('connected', (d) => console.log(`[${time()}] Listening as ${login.user.fullName} (${d.role}). Ctrl+C to stop.\n`));
socket.on('session:expired', () => console.log('Session expired, log in again.'));

socket.on('order:created', (o) =>
  console.log(`[${time()}] NEW ORDER  ${o.orderNumber}  ${o.priority.toUpperCase()}  ${o.drugSnapshot.name} ${o.dose.calculatedValue} ${o.dose.unit}  (${o.departmentCode})`));

socket.on('order:updated', (o) =>
  console.log(`[${time()}] UPDATED    ${o.orderNumber}  → ${o.status.toUpperCase()}  (${o.departmentCode})`));

socket.on('stock:low', (s) =>
  console.log(`[${time()}] LOW STOCK  ${s.drug}: ${s.after} ${s.unit} left (reorder at ${s.reorderLevel})`));

socket.on('order:expiring', (o) =>
  console.log(`[${time()}] EXPIRING   ${o.orderNumber}  ${o.drugSnapshot.name} expires in ${o.minutesToExpiry} min  (${o.departmentCode})`));

socket.on('order:expired', (o) =>
  console.log(`[${time()}] EXPIRED    ${o.orderNumber}  ${o.drugSnapshot.name} passed its beyond-use time: discard and cancel  (${o.departmentCode})`));

socket.on('ai:stock-alert', (s) =>
  console.log(`[${time()}] AI ${s.status.toUpperCase().padEnd(8)} ${s.name}: ${s.daysOfCover} days of cover, order ${s.recommendedOrder.toLocaleString()} ${s.unit} (lead time ${s.leadTimeDays}d)`));