const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const accountController = require('../controllers/account.controller');

const router = express.Router();

// Every account route requires a logged-in user.
router.use(requireAuth);

router.get('/', asyncHandler(accountController.summary));
router.get('/holdings', asyncHandler(accountController.holdings));

module.exports = router;