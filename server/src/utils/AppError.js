// An expected, client-facing error (bad input, not allowed, not found...).
// Anything that is NOT an AppError is treated as an unexpected bug and hidden from the client.
export default class AppError extends Error {
  constructor(message, statusCode = 400, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }

  static badRequest(msg = 'Bad request', details) { return new AppError(msg, 400, details); }
  static unauthorized(msg = 'Not authenticated') { return new AppError(msg, 401); }
  static forbidden(msg = 'You do not have permission to do this') { return new AppError(msg, 403); }
  static notFound(msg = 'Resource not found') { return new AppError(msg, 404); }
  static conflict(msg = 'Conflict') { return new AppError(msg, 409); }
}