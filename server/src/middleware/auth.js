import { User } from '../models/index.js';
import AppError from '../utils/AppError.js';
import { verifyToken } from '../utils/jwt.js';

/**
 * Verifies a JWT and re-checks the account in the database.
 * Shared by HTTP (protect) and Socket.io, so both authenticate identically.
 * @returns {{ user: object, payload: object }}
 */
export async function authenticateToken(token) {
  if (!token) throw AppError.unauthorized('Please log in to continue');

  const payload = verifyToken(token); // throws JWT errors → 401 via errorHandler

  // Always re-check the database: a token stays "valid" for 8h, but the account may change sooner.
  const user = await User.findById(payload.sub)
    .select('fullName email role hospital department isActive passwordChangedAt')
    .lean();

  if (!user) throw AppError.unauthorized('This account no longer exists');
  if (!user.isActive) throw AppError.unauthorized('This account has been deactivated');

  // Password changed after the token was issued → old sessions must log in again
  if (user.passwordChangedAt && Math.floor(user.passwordChangedAt.getTime() / 1000) > payload.iat) {
    throw AppError.unauthorized('Password was changed. Please log in again.');
  }

  // Role or hospital changed since login → token no longer reflects the account
  if (payload.role !== user.role || payload.hospital !== String(user.hospital)) {
    throw AppError.unauthorized('Your account details changed. Please log in again.');
  }

  return {
    payload,
    user: {
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      hospital: user.hospital,
      department: user.department,
    },
  };
}

/**
 * Requires a valid "Authorization: Bearer <token>" header.
 * On success sets req.user = { _id, fullName, email, role, hospital, department }.
 */
export async function protect(req, _res, next) {
  const [scheme, token] = (req.get('authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !token) throw AppError.unauthorized('Please log in to continue');

  const { user } = await authenticateToken(token);
  req.user = user;
  next();
}