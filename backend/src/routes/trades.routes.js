const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const tradesController = require('../controllers/trades.controller');

const router = express.Router();

router.get('/:symbol', asyncHandler(tradesController.recent));

module.exports = router;