const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const authController = require('../controllers/auth.controller');

const router = express.Router();

const registerSchema = {
  email: {
    type: 'string',
    trim: true,
    lowercase: true,
    maxLength: 254,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    patternMessage: 'email is not a valid email address',
  },
  fullName: { type: 'string', trim: true, minLength: 2, maxLength: 100 },
  // No "trim" here: spaces inside a password are allowed.
  // 72 is the longest password bcrypt can handle.
  password: { type: 'string', minLength: 8, maxLength: 72 },
};

const loginSchema = {
  email: { type: 'string', trim: true, lowercase: true, maxLength: 254 },
  password: { type: 'string', maxLength: 72 },
};

router.post('/register', validateBody(registerSchema), asyncHandler(authController.register));
router.post('/login', validateBody(loginSchema), asyncHandler(authController.login));
router.get('/me', requireAuth, asyncHandler(authController.me));

module.exports = router;