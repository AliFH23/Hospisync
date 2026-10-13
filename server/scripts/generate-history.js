// Generates realistic SYNTHETIC order history so the AI module has data to learn from.
// Every generated order has source: "synthetic", so it can be removed at any time.
//
// Usage:
//   npm run seed:history                 → 365 days of history
//   npm run seed:history -- --days 365   → custom length
//   npm run seed:history -- --dry        → print stats only, write nothing
//   npm run seed:history -- --clear      → delete all synthetic orders
//
// Patterns built into the data (so the forecaster has something real to find):
//   - weekly cycle: chemo clinics run Sun–Thu; Fri/Sat are quiet (Jordan weekend)
//   - slow growth trend for oncology (+20% over the period)
//   - winter peak for ER narcotics
//   - random short "surge" days in the ER
//   - ~4% of compounded doses wasted, ~1% cancelled before compounding
//
// Doses are illustrative demo values, NOT a clinical reference.

import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import { Hospital, User, Drug, Order } from '../src/models/index.js';
import { PRIORITY_RANK } from '../src/constants/enums.js';

// ---------------- args ----------------
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const DAYS = Number(args[args.indexOf('--days') + 1]) || 365;
const DRY = flag('dry');
const CLEAR = flag('clear');

// ---------------- deterministic randomness (same data every run) ----------------
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261012);
const uniform = (a, b) => a + rand() * (b - a);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const normal = (mean, sd) => {
  const u = 1 - rand(), v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
function poisson(lambda) {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k += 1; p *= rand(); } while (p > L);
  return k - 1;
}
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

// ---------------- demand profiles per drug ----------------
// base = average orders/day; weekday = multipliers Sun..Sat; trend = growth over the whole period
const CHEMO_WEEK = [1.2, 1.25, 1.2, 1.2, 1.15, 0.1, 0.25];
const FLAT_WEEK = [1, 1, 1, 1, 1, 0.95, 0.95];
const ER_WEEK = [1, 0.95, 0.95, 1, 1.15, 1.2, 1.05];

const PROFILES = {
  DOXO:    { base: 3,   week: CHEMO_WEEK, trend: 0.2, depts: ['ONC', 'HEM'], dose: () => uniform(50, 75), priority: [0.02, 0.18] },
  CYCLO:   { base: 4,   week: CHEMO_WEEK, trend: 0.2, depts: ['ONC', 'HEM'], dose: () => uniform(500, 750), priority: [0.02, 0.18] },
  PACLI:   { base: 2.5, week: CHEMO_WEEK, trend: 0.2, depts: ['ONC'], dose: () => pick([135, 175, 175]), priority: [0.01, 0.15] },
  'TPN-AD':{ base: 6,   week: FLAT_WEEK,  trend: 0.05, depts: ['ICU', 'PED'], dose: () => Math.round(uniform(1000, 2200) / 50) * 50, priority: [0.01, 0.2] },
  MORPH:   { base: 8,   week: ER_WEEK,    trend: 0, winter: 0.35, surge: true, depts: ['ER', 'ICU'], dose: () => pick([2, 2, 4, 4, 5, 8, 10]), priority: [0.35, 0.4] },
  FENT:    { base: 5,   week: ER_WEEK,    trend: 0, winter: 0.25, surge: true, depts: ['ICU', 'ER'], dose: () => pick([1, 1, 1.5, 2]), priority: [0.25, 0.45] },
  KCL:     { base: 7,   week: FLAT_WEEK,  trend: 0.05, depts: ['ICU', 'ER', 'PED'], dose: () => pick([10, 20, 20, 40]), priority: [0.05, 0.3] },
};

// Winter factor: peaks mid-January, lowest mid-July
const winterFactor = (date, strength = 0) =>
  1 + strength * Math.cos(((date.getUTCMonth() + date.getUTCDate() / 31 - 0.5) / 12) * 2 * Math.PI);

function patientFor(dept) {
  const isChild = dept === 'PED';
  const weightKg = round(isChild ? uniform(8, 40) : Math.max(40, normal(74, 13)));
  const heightCm = round(isChild ? uniform(70, 150) : Math.max(145, normal(169, 9)), 0);
  return { weightKg, heightCm, bsa: round(Math.sqrt((heightCm * weightKg) / 3600), 2) };
}

function priorityFor([pEmergency, pUrgent]) {
  const r = rand();
  return r < pEmergency ? 'emergency' : r < pEmergency + pUrgent ? 'urgent' : 'routine';
}

// Order times cluster in day shift (07:00–17:00), some at night
function orderTime(day) {
  const hour = rand() < 0.8 ? uniform(7, 17) : uniform(0, 24);
  return new Date(day.getTime() + hour * 3600e3);
}
const addMin = (d, m) => new Date(d.getTime() + m * 60000);

// ---------------- main ----------------
async function main() {
  await connectDB();

  if (CLEAR) {
    const { deletedCount } = await Order.deleteMany({ source: 'synthetic' });
    console.log(`Removed ${deletedCount} synthetic orders.`);
    return;
  }

  const hospital = await Hospital.findOne({ code: 'DEMO' }).lean();
  if (!hospital) throw new Error('Demo hospital not found. Run "npm run seed" first.');

  const [drugs, nurses, pharmacists, doctors] = await Promise.all([
    Drug.find({ hospital: hospital._id }).lean(),
    User.find({ hospital: hospital._id, role: 'nurse' }).lean(),
    User.find({ hospital: hospital._id, role: 'pharmacist' }).lean(),
    User.find({ hospital: hospital._id, role: 'doctor' }).lean(),
  ]);
  if (!nurses.length || !pharmacists.length || !doctors.length) {
    throw new Error('Need at least one doctor, nurse and pharmacist. Run "npm run seed".');
  }

  const deptByCode = Object.fromEntries(hospital.departments.map((d) => [d.code, d]));
  const nurseFor = (deptId) => nurses.find((n) => String(n.department) === String(deptId)) ?? pick(nurses);
  const doctorFor = (deptId) => doctors.find((d) => String(d.department) === String(deptId)) ?? pick(doctors);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - DAYS * 864e5);

  const docs = [];
  let seq = 0;
  const surgeDays = new Set();
  for (let i = 0; i < DAYS; i++) if (rand() < 0.04) surgeDays.add(i); // ~1 surge every 25 days

  for (let i = 0; i < DAYS; i++) {
    const day = new Date(start.getTime() + i * 864e5);
    const progress = i / DAYS;

    for (const drug of drugs) {
      const p = PROFILES[drug.code];
      if (!p) continue;

      let lambda = p.base * p.week[day.getUTCDay()] * (1 + p.trend * progress) * winterFactor(day, p.winter);
      if (p.surge && surgeDays.has(i)) lambda *= 1.8;

      const count = poisson(lambda);
      for (let k = 0; k < count; k++) {
        const deptCode = pick(p.depts);
        const dept = deptByCode[deptCode];
        if (!dept) continue;

        const nurse = nurseFor(dept._id);
        const doctor = doctorFor(dept._id);
        const pharmacist = pick(pharmacists);
        const pt = patientFor(deptCode);
        const prescribed = round(p.dose(), 2);

        let calculated = drug.dosing.basis === 'bsa' ? prescribed * pt.bsa
          : drug.dosing.basis === 'weight' ? prescribed * pt.weightKg
          : prescribed;
        if (drug.dosing.maxSingleDose) calculated = Math.min(calculated, drug.dosing.maxSingleDose);
        calculated = round(calculated, 2);

        const priority = priorityFor(p.priority);
        const createdAt = orderTime(day);
        const leadMin = priority === 'emergency' ? 30 : priority === 'urgent' ? 90 : uniform(180, 480);
        const requiredBy = addMin(createdAt, leadMin);

        // Outcome: delivered / wasted after compounding / cancelled before compounding
        const r = rand();
        const outcome = r < 0.04 ? 'wasted' : r < 0.05 ? 'cancelledEarly' : 'delivered';

        const history = [{ from: null, to: 'pending', by: doctor._id, role: 'doctor', at: createdAt }];
        const order = {
          orderNumber: `HS-${createdAt.toISOString().slice(0, 10).replace(/-/g, '')}-S${String(++seq).padStart(5, '0')}`,
          hospital: hospital._id,
          department: dept._id,
          departmentCode: dept.code,
          patient: { mrn: `SYN-${String(Math.floor(rand() * 90000) + 10000)}`, name: 'Synthetic Patient', ...pt, allergies: [] },
          drug: drug._id,
          drugSnapshot: {
            name: drug.name, category: drug.category,
            beyondUseHours: drug.stability.beyondUseHours, unitCost: drug.unitCost?.amount ?? 0,
          },
          dose: { prescribedValue: prescribed, basis: drug.dosing.basis, unit: drug.dosing.unit, calculatedValue: calculated },
          route: drug.allowedRoutes[0],
          priority,
          priorityRank: PRIORITY_RANK[priority],
          requiredBy,
          requestedBy: doctor._id,
          prescribedBy: doctor._id,
          prescriberName: doctor.fullName,
          entryType: 'cpoe',
          source: 'synthetic',
          createdAt,
        };

        if (outcome === 'cancelledEarly') {
          const at = addMin(createdAt, uniform(5, 40));
          history.push({ from: 'pending', to: 'cancelled', by: doctor._id, role: 'doctor', at, note: 'Order no longer needed' });
          Object.assign(order, {
            status: 'cancelled',
            cancellation: { reason: 'Order no longer needed', by: doctor._id, at, wasCompounded: false },
          });
        } else {
          const verifiedAt = addMin(createdAt, priority === 'emergency' ? uniform(1, 5) : uniform(5, 25));
          const preparingAt = addMin(verifiedAt, priority === 'emergency' ? uniform(1, 5) : uniform(5, 20));
          const readyAt = addMin(preparingAt, uniform(15, 50));
          history.push(
            { from: 'pending', to: 'verified', by: pharmacist._id, role: 'pharmacist', at: verifiedAt },
            { from: 'verified', to: 'preparing', by: pharmacist._id, role: 'pharmacist', at: preparingAt },
            { from: 'preparing', to: 'ready', by: pharmacist._id, role: 'pharmacist', at: readyAt }
          );
          Object.assign(order, {
            verifiedBy: pharmacist._id, verifiedAt, preparedBy: pharmacist._id, preparingAt, readyAt,
            expiresAt: new Date(readyAt.getTime() + drug.stability.beyondUseHours * 3600e3),
          });

          if (outcome === 'wasted') {
            const at = addMin(readyAt, uniform(30, 600));
            const reason = pick(['Patient discharged', 'Treatment postponed', 'Dose changed by physician', 'Patient condition changed', 'Expired before administration']);
            history.push({ from: 'ready', to: 'cancelled', by: pharmacist._id, role: 'pharmacist', at, note: reason });
            Object.assign(order, { status: 'cancelled', cancellation: { reason, by: pharmacist._id, at, wasCompounded: true } });
          } else {
            const deliveredAt = addMin(readyAt, uniform(5, 40));
            history.push({ from: 'ready', to: 'delivered', by: nurse._id, role: 'nurse', at: deliveredAt });
            Object.assign(order, { status: 'delivered', deliveredAt, receivedBy: nurse._id });
          }
        }

        order.statusHistory = history;
        order.updatedAt = history.at(-1).at;
        order.__v = history.length - 1;
        docs.push(order);
      }
    }
  }

  // ---- summary ----
  const byDrug = {};
  for (const o of docs) {
    const s = (byDrug[o.drugSnapshot.name] ??= { orders: 0, wasted: 0, totalDose: 0, unit: o.dose.unit });
    s.orders += 1;
    if (o.cancellation?.wasCompounded) s.wasted += 1;
    s.totalDose += o.dose.calculatedValue;
  }
  console.log(`\n${DRY ? '[DRY RUN] ' : ''}${docs.length} synthetic orders over ${DAYS} days (${start.toISOString().slice(0, 10)} → ${today.toISOString().slice(0, 10)})`);
  console.table(Object.fromEntries(Object.entries(byDrug).map(([k, v]) => [k, {
    orders: v.orders, perDay: round(v.orders / DAYS), wasted: v.wasted, [`total`]: `${Math.round(v.totalDose)} ${v.unit}`,
  }])));

  if (DRY) return;

  // Replace previous synthetic history, keep live orders untouched
  const { deletedCount } = await Order.deleteMany({ source: 'synthetic' });
  if (deletedCount) console.log(`Replaced ${deletedCount} existing synthetic orders.`);

  // Raw insert: historical orders legitimately have past dates and final statuses,
  // which the live-order validation (correctly) rejects. Bypassing it is safe here
  // because we build every field ourselves above.
  const BATCH = 1000;
  for (let i = 0; i < docs.length; i += BATCH) {
    await Order.collection.insertMany(docs.slice(i, i + BATCH), { ordered: false });
    process.stdout.write(`\rInserted ${Math.min(i + BATCH, docs.length)}/${docs.length}`);
  }
  console.log('\nDone.');
}

try {
  await main();
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}