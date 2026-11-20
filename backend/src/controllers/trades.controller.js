const orderbookService = require('../services/orderbook.service');

async function recent(req, res) {
  const number = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(number) && number >= 1 ? Math.min(number, 200) : 50;
  const result = await orderbookService.getRecentTrades(req.params.symbol, limit);
  res.json(result);
}

module.exports = { recent };