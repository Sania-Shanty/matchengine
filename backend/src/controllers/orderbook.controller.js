const orderbookService = require('../services/orderbook.service');

async function getBook(req, res) {
  const book = await orderbookService.getOrderBook(req.params.symbol);
  res.json(book);
}

module.exports = { getBook };