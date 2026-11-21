const marketService = require('../services/market.service');

async function summary(req, res) {
  const market = await marketService.getMarketSummary();
  res.json({ market });
}

module.exports = { summary };