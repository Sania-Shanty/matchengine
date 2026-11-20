// Clear, named errors. The error handler turns these into neat JSON replies.

class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const badRequest = (message, code = 'BAD_REQUEST') => new AppError(400, code, message);
const unauthorized = (message = 'You must log in first.') =>
  new AppError(401, 'UNAUTHORIZED', message);
const forbidden = (message = 'You are not allowed to do that.') =>
  new AppError(403, 'FORBIDDEN', message);
const notFound = (message = 'Not found.') => new AppError(404, 'NOT_FOUND', message);
const conflict = (message, code = 'CONFLICT') => new AppError(409, code, message);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict };