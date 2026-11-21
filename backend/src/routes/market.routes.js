const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const marketController = require('../controllers/market.controller');

const router = express.Router();

router.get('/', asyncHandler(marketController.summary));

module.exports = router;