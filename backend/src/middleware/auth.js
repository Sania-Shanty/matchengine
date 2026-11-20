// The login checkpoint. Put it in front of any route that needs a logged-in user.
// The browser sends:  Authorization: Bearer <token>

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { unauthorized } = require('../utils/errors');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(unauthorized('Missing or malformed Authorization header.'));
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    // Database ids are kept as strings (BIGSERIAL values can be larger than JS numbers).
    req.user = { id: String(payload.sub) };
    return next();
  } catch (error) {
    return next(unauthorized('Invalid or expired token.'));
  }
}

module.exports = { requireAuth };