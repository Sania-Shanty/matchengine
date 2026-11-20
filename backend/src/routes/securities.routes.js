const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const securitiesController = require('../controllers/securities.controller');

const router = express.Router();

router.get('/', asyncHandler(securitiesController.list));
router.get('/:symbol', asyncHandler(securitiesController.getOne));

module.exports = router;