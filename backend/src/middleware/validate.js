// Rejects bad input before it reaches our logic.
//
// Example schema:
//   { email: { type: 'string', trim: true, lowercase: true, maxLength: 254 } }
//
// Rules: type ('string'), trim, lowercase, minLength, maxLength, pattern, patternMessage.
// Passwords must NOT be trimmed, so we simply leave out "trim" for them.

const { badRequest } = require('../utils/errors');

function validateBody(schema) {
  return (req, res, next) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const cleaned = {};
    const problems = [];

    for (const [field, rule] of Object.entries(schema)) {
      let value = body[field];

      if (value === undefined || value === null || value === '') {
        problems.push(`${field} is required`);
        continue;
      }

      if (rule.type === 'string') {
        if (typeof value !== 'string') {
          problems.push(`${field} must be text`);
          continue;
        }
        if (rule.trim) value = value.trim();
        if (rule.lowercase) value = value.toLowerCase();

        if (value.length === 0) {
          problems.push(`${field} is required`);
          continue;
        }
        if (rule.minLength && value.length < rule.minLength) {
          problems.push(`${field} must be at least ${rule.minLength} characters`);
          continue;
        }
        if (rule.maxLength && value.length > rule.maxLength) {
          problems.push(`${field} must be at most ${rule.maxLength} characters`);
          continue;
        }
        if (rule.pattern && !rule.pattern.test(value)) {
          problems.push(rule.patternMessage || `${field} is not in a valid format`);
          continue;
        }
      }

      cleaned[field] = value;
    }

    if (problems.length > 0) {
      return next(badRequest(problems.join('; '), 'VALIDATION_ERROR'));
    }

    req.body = cleaned;
    return next();
  };
}

module.exports = { validateBody };