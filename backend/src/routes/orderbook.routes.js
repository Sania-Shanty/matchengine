const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const orderbookController = require('../controllers/orderbook.controller');

const router = express.Router();

router.get('/:symbol', asyncHandler(orderbookController.getBook));

module.exports = router;