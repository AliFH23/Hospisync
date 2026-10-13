// Seeds the database with realistic DEMO data for development.
// ⚠️ Wipes the whole database first. Never run against production.
// Usage: npm run seed
//
// Drug values below are illustrative demo data, NOT a clinical reference.

import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { Hospital, User, Drug, Order, AuditLog } from '../models/index.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed: NODE_ENV is production.');
  process.exit(1);
}

const PASSWORD = process.env.SEED_PASSWORD || 'Hospisync@2026';
const hoursFromNow = (h) => new Date(Date.now() + h * 3600 * 1000);

// ---------- helpers ----------

async function audit(hospital, actor, action, entityType, entityId, changes) {
  await AuditLog.create({
    hospital: hospital._id,
    actor: actor ? { user: actor._id, role: actor.role, name: actor.fullName } : { role: 'system', name: 'seed' },
    action,
    entity: { type: entityType, id: entityId },
    changes,
  });
}

// author = who types it (doctor, or nurse for a verbal order); prescriber = responsible doctor
async function createOrder(hospital, author, drug, data, prescriber = author) {
  const dept = hospital.departments.id(author.department);
  const verbal = author._id !== prescriber._id;
  const order = new Order({
    hospital: hospital._id,
    department: dept._id,
    departmentCode: dept.code,
    drug: drug._id,
    drugSnapshot: {
      name: drug.name,
      category: drug.category,
      beyondUseHours: drug.stability.beyondUseHours,
      unitCost: drug.unitCost.amount,
    },
    requestedBy: author._id,
    prescribedBy: prescriber._id,
    prescriberName: prescriber.fullName,
    entryType: verbal ? 'verbal' : 'cpoe',
    ...(verbal && { verbalOrder: { readBack: true, cosignDueAt: hoursFromNow(24) } }),
    ...data,
  });
  order.$locals.creatorRole = author.role;
  await order.save();
  await audit(hospital, author, 'ORDER_CREATED', 'Order', order._id, { after: { status: order.status, entryType: order.entryType } });
  return order;
}

// Moves an order through several statuses, saving and auditing each step.
async function move(hospital, order, steps) {
  for (const [to, user, opts] of steps) {
    const from = order.status;
    order.transitionTo(to, user, opts);
    await order.save();
    await audit(hospital, user, to === 'cancelled' ? 'ORDER_CANCELLED' : 'ORDER_STATUS_CHANGED',
      'Order', order._id, { before: { status: from }, after: { status: to } });
  }
}

// ---------- seed ----------

async function seed() {
  await connectDB();

  console.log('Dropping database...');
  await mongoose.connection.db.dropDatabase();
  // Rebuild indexes (unique constraints) before inserting anything.
  for (const Model of [Hospital, User, Drug, Order, AuditLog]) await Model.syncIndexes();

  // Hospital + departments
  const hospital = await Hospital.create({
    name: 'Hospisync Demo Hospital',
    code: 'DEMO',
    city: 'Irbid',
    country: 'Jordan',
    departments: [
      { name: 'Oncology', code: 'ONC', type: 'ONCOLOGY', floor: '4' },
      { name: 'Hematology', code: 'HEM', type: 'HEMATOLOGY', floor: '4' },
      { name: 'Intensive Care Unit', code: 'ICU', type: 'ICU', floor: '2' },
      { name: 'Emergency', code: 'ER', type: 'ER', floor: 'G' },
      { name: 'Pediatrics', code: 'PED', type: 'PEDIATRICS', floor: '3' },
    ],
  });
  await audit(hospital, null, 'HOSPITAL_CREATED', 'Hospital', hospital._id);
  const dept = (code) => hospital.departments.find((d) => d.code === code)._id;

  // Users (User.create runs the pre-save hook, so passwords get hashed)
  const [admin, ph1, ph2, nurseOnc, nurseIcu, nurseEr, drOnc, drIcu, drEr] = await User.create([
    { fullName: 'System Admin', email: 'admin@hospisync.dev', role: 'admin', employeeId: 'ADM-001' },
    { fullName: 'Lina Haddad', email: 'pharmacist1@hospisync.dev', role: 'pharmacist', employeeId: 'PH-101' },
    { fullName: 'Omar Khalil', email: 'pharmacist2@hospisync.dev', role: 'pharmacist', employeeId: 'PH-102' },
    { fullName: 'Sara Nasser', email: 'nurse.onc@hospisync.dev', role: 'nurse', employeeId: 'RN-201', department: dept('ONC') },
    { fullName: 'Yousef Saleh', email: 'nurse.icu@hospisync.dev', role: 'nurse', employeeId: 'RN-202', department: dept('ICU') },
    { fullName: 'Rania Odeh', email: 'nurse.er@hospisync.dev', role: 'nurse', employeeId: 'RN-203', department: dept('ER') },
    { fullName: 'Dr. Rami Haddad', email: 'doctor.onc@hospisync.dev', role: 'doctor', employeeId: 'MD-301', department: dept('ONC') },
    { fullName: 'Dr. Noor Abbas', email: 'doctor.icu@hospisync.dev', role: 'doctor', employeeId: 'MD-302', department: dept('ICU') },
    { fullName: 'Dr. Ziad Qasem', email: 'doctor.er@hospisync.dev', role: 'doctor', employeeId: 'MD-303', department: dept('ER') },
  ].map((u) => ({ ...u, password: PASSWORD, hospital: hospital._id })));
  const everyone = [admin, ph1, ph2, drOnc, drIcu, drEr, nurseOnc, nurseIcu, nurseEr];
  for (const u of everyone) {
    await audit(hospital, null, 'USER_CREATED', 'User', u._id);
  }

  // Drug formulary
  const drugDefs = [
    { code: 'DOXO', name: 'Doxorubicin', category: 'chemotherapy', dosing: { basis: 'bsa', unit: 'mg', maxSingleDose: 150 },
      allowedRoutes: ['IV_INFUSION', 'IV_PUSH'], stability: { beyondUseHours: 24, storage: 'refrigerated' },
      unitCost: { amount: 1.2 }, stock: { onHand: 800, reorderLevel: 300 } },
    { code: 'CYCLO', name: 'Cyclophosphamide', category: 'chemotherapy', dosing: { basis: 'bsa', unit: 'mg', maxSingleDose: 2000 },
      allowedRoutes: ['IV_INFUSION'], stability: { beyondUseHours: 24, storage: 'refrigerated' },
      unitCost: { amount: 0.05 }, stock: { onHand: 10000, reorderLevel: 4000 } },
    { code: 'PACLI', name: 'Paclitaxel', category: 'chemotherapy', dosing: { basis: 'bsa', unit: 'mg', maxSingleDose: 400 },
      allowedRoutes: ['IV_INFUSION'], stability: { beyondUseHours: 27, storage: 'room_temp' },
      unitCost: { amount: 0.9 }, stock: { onHand: 600, reorderLevel: 700 } }, // intentionally low stock
    { code: 'TPN-AD', name: 'Adult TPN (3-in-1)', category: 'tpn', dosing: { basis: 'fixed', unit: 'mL', maxSingleDose: 3000 },
      allowedRoutes: ['CENTRAL_LINE'], stability: { beyondUseHours: 30, storage: 'refrigerated' },
      unitCost: { amount: 0.03 }, stock: { onHand: 40000, reorderLevel: 15000 } },
    { code: 'MORPH', name: 'Morphine Sulfate', category: 'narcotic', controlledSchedule: 'II',
      dosing: { basis: 'fixed', unit: 'mg', maxSingleDose: 15 },
      allowedRoutes: ['IV_PUSH', 'IV_INFUSION'], stability: { beyondUseHours: 24 },
      unitCost: { amount: 0.4 }, stock: { onHand: 500, reorderLevel: 200 } },
    { code: 'FENT', name: 'Fentanyl Citrate', category: 'narcotic', controlledSchedule: 'II',
      dosing: { basis: 'weight', unit: 'mcg', maxSingleDose: 200 },
      allowedRoutes: ['IV_PUSH', 'IV_INFUSION'], stability: { beyondUseHours: 24 },
      unitCost: { amount: 0.02 }, stock: { onHand: 20000, reorderLevel: 8000 } },
    { code: 'KCL', name: 'Potassium Chloride (concentrate)', category: 'other_high_alert',
      dosing: { basis: 'fixed', unit: 'mEq', maxSingleDose: 40 },
      allowedRoutes: ['IV_INFUSION'], stability: { beyondUseHours: 24 },
      unitCost: { amount: 0.1 }, stock: { onHand: 2000, reorderLevel: 500 } },
  ];
  const drugs = await Drug.create(drugDefs.map((d) => ({ ...d, hospital: hospital._id })));
  const drug = (code) => drugs.find((d) => d.code === code);
  for (const d of drugs) await audit(hospital, admin, 'DRUG_CREATED', 'Drug', d._id);

  // Orders: one in every status so each dashboard has something to show
  const adultPatient = (mrn, name) => ({ mrn, name, weightKg: 72, heightCm: 170 });

  // 1) pending · emergency · ER morphine: VERBAL order by the ER nurse, waiting for Dr. Qasem's co-signature
  await createOrder(hospital, nurseEr, drug('MORPH'), {
    patient: { mrn: 'MRN-10001', name: 'Ahmad Ali', weightKg: 80, heightCm: 178 },
    dose: { prescribedValue: 4, basis: 'fixed', unit: 'mg' },
    route: 'IV_PUSH', priority: 'emergency', requiredBy: hoursFromNow(0.5),
  }, drEr);

  // 2) pending · routine · oncology doxorubicin 60 mg/m2 (doctor entered it)
  await createOrder(hospital, drOnc, drug('DOXO'), {
    patient: adultPatient('MRN-10002', 'Mona Yaseen'),
    dose: { prescribedValue: 60, basis: 'bsa', unit: 'mg' },
    route: 'IV_INFUSION', diluent: { name: 'NS 0.9%', volumeMl: 250 }, infusionDurationMin: 30,
    priority: 'routine', requiredBy: hoursFromNow(6),
  });

  // 3) preparing · urgent · ICU fentanyl 1 mcg/kg
  const o3 = await createOrder(hospital, drIcu, drug('FENT'), {
    patient: { mrn: 'MRN-10003', name: 'Khaled Omar', weightKg: 90, heightCm: 182 },
    dose: { prescribedValue: 1, basis: 'weight', unit: 'mcg' },
    route: 'IV_INFUSION', priority: 'urgent', requiredBy: hoursFromNow(1),
  });
  await move(hospital, o3, [['verified', ph1], ['preparing', ph1]]);

  // 4) ready · routine · ICU TPN
  const o4 = await createOrder(hospital, drIcu, drug('TPN-AD'), {
    patient: adultPatient('MRN-10004', 'Huda Saeed'),
    dose: { prescribedValue: 1500, basis: 'fixed', unit: 'mL' },
    route: 'CENTRAL_LINE', infusionDurationMin: 1440, priority: 'routine', requiredBy: hoursFromNow(4),
  });
  await move(hospital, o4, [['verified', ph2], ['preparing', ph2], ['ready', ph2, { note: 'Double-checked by second pharmacist' }]]);

  // 5) delivered · urgent · oncology cyclophosphamide 600 mg/m2
  const o5 = await createOrder(hospital, drOnc, drug('CYCLO'), {
    patient: adultPatient('MRN-10005', 'Fadi Hamdan'),
    dose: { prescribedValue: 600, basis: 'bsa', unit: 'mg' },
    route: 'IV_INFUSION', diluent: { name: 'NS 0.9%', volumeMl: 500 }, infusionDurationMin: 60,
    priority: 'urgent', requiredBy: hoursFromNow(2),
  });
  await move(hospital, o5, [['verified', ph1], ['preparing', ph1], ['ready', ph1], ['delivered', nurseOnc]]);

  // 6) cancelled after compounding → counts as waste
  const o6 = await createOrder(hospital, drOnc, drug('PACLI'), {
    patient: adultPatient('MRN-10006', 'Reem Tawfiq'),
    dose: { prescribedValue: 175, basis: 'bsa', unit: 'mg' },
    route: 'IV_INFUSION', diluent: { name: 'D5W', volumeMl: 500 }, infusionDurationMin: 180,
    priority: 'routine', requiredBy: hoursFromNow(5),
  });
  await move(hospital, o6, [['verified', ph1], ['preparing', ph1], ['cancelled', drOnc, { reason: 'Treatment postponed: low neutrophil count' }]]);

  // 7) verified · urgent · ICU potassium chloride: checked by the pharmacist, not started yet
  const o7 = await createOrder(hospital, drIcu, drug('KCL'), {
    patient: { mrn: 'MRN-10007', name: 'Samer Nabil', weightKg: 76, heightCm: 175 },
    dose: { prescribedValue: 20, basis: 'fixed', unit: 'mEq' },
    route: 'IV_INFUSION', diluent: { name: 'NS 0.9%', volumeMl: 500 }, infusionDurationMin: 240,
    priority: 'urgent', requiredBy: hoursFromNow(2),
  });
  await move(hospital, o7, [['verified', ph2, { note: 'K+ 3.1 mmol/L confirmed, rate within limits' }]]);

  // ---------- summary ----------
  const counts = await Promise.all([Hospital, User, Drug, Order, AuditLog].map((M) => M.countDocuments()));
  const byStatus = await Order.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }, { $sort: { _id: 1 } }]);

  console.log('\nSeed complete');
  console.table({ hospitals: counts[0], users: counts[1], drugs: counts[2], orders: counts[3], auditLogs: counts[4] });
  console.table(Object.fromEntries(byStatus.map((s) => [s._id, s.n])));
  console.log(`Demo logins (password for all: ${PASSWORD})`);
  console.table(everyone.map((u) => ({ email: u.email, role: u.role })));
}

try {
  await seed();
} catch (err) {
  console.error('Seed failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}