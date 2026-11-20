const securitiesService = require('../services/securities.service');

async function list(req, res) {
  const securities = await securitiesService.listSecurities();
  res.json({ securities });
}

async function getOne(req, res) {
  const security = await securitiesService.getSecurityBySymbol(req.params.symbol);
  res.json({ security });
}

module.exports = { list, getOne };