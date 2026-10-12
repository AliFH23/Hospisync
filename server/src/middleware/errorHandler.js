import mongoose from 'mongoose';
import AppError from '../utils/AppError.js';

// 404 for any route that didn't match
export function notFound(req, _res, next) {
  next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// Converts known library errors into clean AppErrors
function normalize(err) {
  if (err instanceof AppError) return err;

  // Mongoose schema validation → 400 with a message per field
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.fromEntries(Object.entries(err.errors).map(([path, e]) => [path, e.message]));
    return new AppError('Validation failed', 400, details);
  }
  // Invalid ObjectId in a URL or query
  if (err instanceof mongoose.Error.CastError) {
    return new AppError(`Invalid value for "${err.path}"`, 400);
  }
  // optimisticConcurrency: someone else updated the document first
  if (err instanceof mongoose.Error.VersionError) {
    return new AppError('This record was changed by someone else. Reload and try again.', 409);
  }
  // Unique index violation
  if (err.code === 11000) {
    const fields = Object.keys(err.keyValue || {}).join(', ');
    return new AppError(`Duplicate value for: ${fields}`, 409);
  }
  // JWT problems (used from Phase 2 step 3)
  if (err.name === 'TokenExpiredError') return AppError.unauthorized('Session expired. Please log in again.');
  if (err.name === 'JsonWebTokenError') return AppError.unauthorized('Invalid token. Please log in again.');
  // Malformed JSON body
  if (err.type === 'entity.parse.failed') return AppError.badRequest('Malformed JSON in request body');

  // Errors thrown with a statusCode (e.g. Order.transitionTo) are expected business-rule errors
  if (err.statusCode && err.statusCode < 500) return new AppError(err.message, err.statusCode);

  return null; // unknown → real bug
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const known = normalize(err);
  const isDev = process.env.NODE_ENV !== 'production';

  if (!known) {
    console.error(`[ERROR] ${req.method} ${req.originalUrl}\n`, err);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong on our side',
      ...(isDev && { debug: err.message }),
    });
  }

  res.status(known.statusCode).json({
    success: false,
    message: known.message,
    ...(known.details && { details: known.details }),
  });
}