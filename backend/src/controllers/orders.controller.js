const orderService = require('../services/order.service');

function parseLimit(value, fallback, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isInteger(number) || number < 1) return fallback;
  return Math.min(number, max);
}

async function create(req, res) {
  const result = await orderService.placeOrder(req.user.id, req.body);
  res.status(201).json(result);
}

async function list(req, res) {
  const symbol = typeof req.query.symbol === 'string' ? req.query.symbol.toUpperCase() : null;
  const limit = parseLimit(req.query.limit, 100, 500);
  const orders = await orderService.listOrders(req.user.id, { symbol, limit });
  res.json({ orders });
}

async function getOne(req, res) {
  const result = await orderService.getOrder(req.user.id, req.params.id);
  res.json(result);
}

module.exports = { create, list, getOne };