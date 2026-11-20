const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const ordersController = require('../controllers/orders.controller');

const router = express.Router();

// Every order route requires a logged-in user.
router.use(requireAuth);

router.post('/', asyncHandler(ordersController.create));
router.get('/', asyncHandler(ordersController.list));
router.get('/:id', asyncHandler(ordersController.getOne));

module.exports = router;