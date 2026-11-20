const accountService = require('../services/account.service');

async function summary(req, res) {
  const account = await accountService.getAccountSummary(req.user.id);
  res.json({ account });
}

async function holdings(req, res) {
  const rows = await accountService.getHoldings(req.user.id);
  res.json({ holdings: rows });
}

module.exports = { summary, holdings };