import { User } from '../models/index.js';
import AppError from '../utils/AppError.js';
import { verifyToken } from '../utils/jwt.js';

/**
 * Requires a valid "Authorization: Bearer <token>" header.
 * On success sets req.user = { _id, fullName, email, role, hospital, department }.
 * Invalid/expired tokens throw JWT errors, which errorHandler turns into 401s.
 */
export async function protect(req, _res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw AppError.unauthorized('Please log in to continue');

  const payload = verifyToken(token);

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

  req.user = {
    _id: user._id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    hospital: user.hospital,
    department: user.department,
  };
  next();
}