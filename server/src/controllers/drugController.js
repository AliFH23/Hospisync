import { Drug } from '../models/index.js';
import AppError from '../utils/AppError.js';
import { ROLES, DRUG_CATEGORIES } from '../constants/enums.js';

// What each role is allowed to see. Nurses only need what the order form uses:
// no costs, no stock levels.
const NURSE_FIELDS = 'code name genericName category isHighAlert controlledSchedule dosing allowedRoutes stability isActive';
const STAFF_FIELDS = `${NURSE_FIELDS} unitCost stock updatedAt`;

const fieldsFor = (role) => (role === ROLES.NURSE ? NURSE_FIELDS : STAFF_FIELDS);

// Adds isLowStock for staff (virtuals don't run on .lean() results)
function shape(drug, role) {
  if (role === ROLES.NURSE || !drug.stock) return drug;
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
    if (role === ROLES.NURSE) throw AppError.forbidden('Stock information is not available for your role');
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