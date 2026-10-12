import rateLimit from 'express-rate-limit';
import AppError from '../utils/AppError.js';

const json429 = (message) => (_req, res) => res.status(429).json({ success: false, message });

// Login: max 10 FAILED attempts per IP per 15 minutes (successful logins don't count)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: json429('Too many failed login attempts. Try again in 15 minutes.'),
});

// Whole API: generous cap to stop scripts/abuse, not normal use
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: json429('Too many requests. Please slow down.'),
});

// Rejects keys that MongoDB treats as operators ("$gt", "$where") or paths ("a.b").
// Covers JSON bodies; Express 5's default query parser already returns strings only.
function hasUnsafeKey(value, depth = 0) {
  if (depth > 20 || value === null || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([k, v]) => k.startsWith('$') || k.includes('.') || hasUnsafeKey(v, depth + 1)
  );
}

export function rejectMongoOperators(req, _res, next) {
  if (hasUnsafeKey(req.body)) throw AppError.badRequest('Request contains invalid field names');
  next();
}