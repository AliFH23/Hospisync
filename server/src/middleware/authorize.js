import AppError from '../utils/AppError.js';
import { ROLES } from '../constants/enums.js';

const VALID_ROLES = new Set(Object.values(ROLES));

/**
 * Allows the request only if req.user.role is one of the given roles.
 * Must run AFTER protect.
 * Usage: router.get('/queue', protect, authorize(ROLES.PHARMACIST), handler)
 */
export function authorize(...allowedRoles) {
  // Catch typos like authorize('pharmacists') at startup, not in production
  for (const r of allowedRoles) {
    if (!VALID_ROLES.has(r)) throw new Error(`authorize(): unknown role "${r}"`);
  }

  return (req, _res, next) => {
    if (!req.user) throw AppError.unauthorized('Please log in to continue');
    if (!allowedRoles.includes(req.user.role)) {
      throw AppError.forbidden(`This action requires role: ${allowedRoles.join(' or ')}`);
    }
    next();
  };
}