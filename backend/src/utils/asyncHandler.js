// Express 4 does not catch errors thrown inside async functions by itself.
// This wrapper passes any error on to our error handler.

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;