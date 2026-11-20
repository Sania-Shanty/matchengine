// The safety net at the end of the line. Turns every error into a clean JSON reply.
// Real details of unexpected errors go to the terminal, not to the user.

const { AppError, notFound } = require('../utils/errors');

function notFoundHandler(req, res, next) {
  next(notFound(`No route for ${req.method} ${req.originalUrl}`));
}

// Express recognises an error handler by its four arguments. Keep all four.
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
  }

  // Malformed JSON sent by the client
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' },
    });
  }

  console.error('Unexpected error:', error);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server.' },
  });
}

module.exports = { notFoundHandler, errorHandler };