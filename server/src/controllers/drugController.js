import { Drug } from '../models/index.js';
import AppError from '../utils/AppError.js';
import { logAudit } from '../utils/audit.js';
import { ROLES, DRUG_CATEGORIES } from '../constants/enums.js';

// What each role is allowed to see. Nurses only need what the order form uses:
// no costs, no stock levels.
const NURSE_FIELDS = 'code name genericName category isHighAlert controlledSchedule dosing allowedRoutes stability isActive';
const STAFF_FIELDS = `${NURSE_FIELDS} unitCost stock updatedAt`;

// Clinicians (doctors, nurses) see clinical fields only; pharmacy staff also see stock and cost
const CLINICAL_ROLES = [ROLES.NURSE, ROLES.DOCTOR];
const fieldsFor = (role) => (CLINICAL_ROLES.includes(role) ? NURSE_FIELDS : STAFF_FIELDS);

// Adds isLowStock for staff (virtuals don't run on .lean() results)
function shape(drug, role) {
  if (CLINICAL_ROLES.includes(role) || !drug.stock) return drug;
  return { ...drug, isLowStock: drug.stock.onHand <= drug.stock.reorderLevel };
}

// Escapes user input so it is matched literally inside a RegExp (prevents ReDoS / regex injection)
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * GET /api/drugs
 * Query (all optional):
 *   q         search by name or generic name (min 2 chars)
 *   category  chemotherapy | tpn | narcotic | other_high_alert
 *   lowStock  true → only drugs at/below reorder level (pharmacist/admin)
 *   active    false → include deactivated drugs (admin only)
 */
export async function listDrugs(req, res) {
  const { q, category, lowStock, active } = req.query;
  const { role, hospital } = req.user;

  const filter = { hospital }; // always scoped to the user's hospital

  // Only admins may see deactivated drugs
  if (!(role === ROLES.ADMIN && active === 'false')) filter.isActive = true;

  if (category !== undefined) {
    if (!Object.values(DRUG_CATEGORIES).includes(category)) {
      throw AppError.badRequest(`Invalid category. Use one of: ${Object.values(DRUG_CATEGORIES).join(', ')}`);
    }
    filter.category = category;
  }

  if (q !== undefined) {
    const term = String(q).trim();
    if (term.length < 2 || term.length > 50) throw AppError.badRequest('Search term must be 2-50 characters');
    const rx = new RegExp(escapeRegex(term), 'i');
    filter.$or = [{ name: rx }, { genericName: rx }, { code: rx }];
  }

  if (lowStock === 'true') {
    if (CLINICAL_ROLES.includes(role)) throw AppError.forbidden('Stock information is not available for your role');
    filter.$expr = { $lte: ['$stock.onHand', '$stock.reorderLevel'] };
  }

  const drugs = await Drug.find(filter)
    .select(fieldsFor(role))
    .sort({ category: 1, name: 1 })
    .limit(200)
    .lean();

  res.json({ success: true, count: drugs.length, drugs: drugs.map((d) => shape(d, role)) });
}

// GET /api/drugs/:id
export async function getDrug(req, res) {
  const { role, hospital } = req.user;
  const filter = { _id: req.params.id, hospital };
  if (role !== ROLES.ADMIN) filter.isActive = true;

  const drug = await Drug.findOne(filter).select(fieldsFor(role)).lean();
  // Same 404 whether it doesn't exist or belongs to another hospital: don't leak other hospitals' data
  if (!drug) throw AppError.notFound('Drug not found');

  res.json({ success: true, drug: shape(drug, role) });
}

// =====================================================================
// Managing the formulary
// =====================================================================

// Fields an admin may set. hospital, stock.onHand and timestamps are never taken from the body.
const DRUG_FIELDS = ['code', 'name', 'genericName', 'category', 'isHighAlert', 'controlledSchedule', 'allowedRoutes', 'isActive'];

function drugUpdateFromBody(body) {
  const set = pick(body, DRUG_FIELDS);
  const nested = {
    dosing: pick(body.dosing, ['basis', 'unit', 'maxSingleDose']),
    stability: pick(body.stability, ['beyondUseHours', 'storage']),
    unitCost: pick(body.unitCost, ['amount', 'currency']),
    stock: pick(body.stock, ['reorderLevel']), // onHand only changes through /stock (audited)
  };
  for (const [group, values] of Object.entries(nested)) {
    for (const [k, v] of Object.entries(values)) set[`${group}.${k}`] = v;
  }
  return set;
}

const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));

/**
 * POST /api/drugs  (admin)
 * Body: { code, name, genericName?, category, controlledSchedule?, dosing{basis,unit,maxSingleDose?},
 *         allowedRoutes[], stability{beyondUseHours,storage?}, unitCost{amount}, stock{onHand?, reorderLevel} }
 */
export async function createDrug(req, res) {
  const b = req.body ?? {};
  const fields = pick(b, DRUG_FIELDS);
  if (!fields.controlledSchedule) delete fields.controlledSchedule; // "" from an empty select
  const drug = new Drug({
    ...fields,
    hospital: req.user.hospital,
    dosing: pick(b.dosing, ['basis', 'unit', 'maxSingleDose']),
    stability: pick(b.stability, ['beyondUseHours', 'storage']),
    unitCost: pick(b.unitCost, ['amount', 'currency']),
    stock: pick(b.stock, ['onHand', 'reorderLevel']), // opening stock is allowed once, at creation
  });
  await drug.save(); // schema validation; duplicate code → 409 from the error handler

  await logAudit({
    req, hospital: req.user.hospital, actor: req.user,
    action: 'DRUG_CREATED', entityType: 'Drug', entityId: drug._id,
    changes: { after: { code: drug.code, name: drug.name, onHand: drug.stock.onHand } },
  });
  res.status(201).json({ success: true, drug: shape(drug.toObject(), req.user.role) });
}

/**
 * PATCH /api/drugs/:id  (admin)
 * Any subset of the createDrug fields, except stock.onHand.
 */
export async function updateDrug(req, res) {
  const set = drugUpdateFromBody(req.body ?? {});
  if (!Object.keys(set).length) throw AppError.badRequest('Nothing to update');

  const before = await Drug.findOne({ _id: req.params.id, hospital: req.user.hospital }).lean();
  if (!before) throw AppError.notFound('Drug not found');

  // Rules that need the whole document (validators in update queries only see the changed fields)
  const unset = {};
  if (set.controlledSchedule === '' || set.controlledSchedule === null) { delete set.controlledSchedule; unset.controlledSchedule = 1; }
  const category = set.category ?? before.category;
  const schedule = unset.controlledSchedule ? null : set.controlledSchedule ?? before.controlledSchedule;
  if (category === DRUG_CATEGORIES.NARCOTIC && !schedule) throw AppError.badRequest('Narcotics must have a controlled-substance schedule');

  const drug = await Drug.findOneAndUpdate(
    { _id: req.params.id, hospital: req.user.hospital },
    { $set: set, ...(Object.keys(unset).length && { $unset: unset }) },
    { new: true, runValidators: true, context: 'query' }
  ).lean();

  const changed = Object.fromEntries([...Object.keys(set), ...Object.keys(unset)].map((k) => [k, k.split('.').reduce((o, p) => o?.[p], before)]));
  await logAudit({
    req, hospital: req.user.hospital, actor: req.user,
    action: 'DRUG_UPDATED', entityType: 'Drug', entityId: drug._id,
    changes: { before: changed, after: { ...set, ...Object.fromEntries(Object.keys(unset).map((k) => [k, null])) } },
  });
  res.json({ success: true, drug: shape(drug, req.user.role) });
}

/**
 * POST /api/drugs/:id/stock  (pharmacist, admin)
 * Body: { type: 'receive', quantity > 0, note? }        a delivery arrived: adds to stock
 *    or { type: 'count', quantity >= 0, note }           physical count: sets stock (reason required)
 */
export async function adjustStock(req, res) {
  const { type, quantity, note } = req.body ?? {};
  const qty = Number(quantity);
  if (!['receive', 'count'].includes(type)) throw AppError.badRequest('type must be "receive" or "count"');
  if (!Number.isFinite(qty) || qty < 0 || (type === 'receive' && qty === 0)) throw AppError.badRequest('Invalid quantity');
  if (qty > 1e8) throw AppError.badRequest('Quantity is too large');
  if (note !== undefined && (typeof note !== 'string' || note.length > 300)) throw AppError.badRequest('Note must be text (max 300 characters)');
  if (type === 'count' && !note?.trim()) throw AppError.badRequest('A reason is required for a stock count correction');

  const filter = { _id: req.params.id, hospital: req.user.hospital };
  // Atomic: $inc for deliveries so a concurrent "start preparing" deduction is never lost
  const update = type === 'receive' ? { $inc: { 'stock.onHand': qty } } : { $set: { 'stock.onHand': qty } };
  const before = await Drug.findOneAndUpdate(filter, update, { new: false }).select('name stock dosing.unit').lean();
  if (!before) throw AppError.notFound('Drug not found');

  const after = type === 'receive' ? before.stock.onHand + qty : qty;
  await logAudit({
    req, hospital: req.user.hospital, actor: req.user,
    action: 'STOCK_ADJUSTED', entityType: 'Drug', entityId: before._id,
    changes: { before: { onHand: before.stock.onHand }, after: { onHand: after, type, ...(note && { reason: note.trim() }) } },
  });

  const drug = await Drug.findById(before._id).select(fieldsFor(req.user.role)).lean();
  res.json({ success: true, drug: shape(drug, req.user.role) });
}