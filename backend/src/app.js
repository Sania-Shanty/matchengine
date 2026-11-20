// Builds the Express application: the "switchboard" that connects everything.
// It does NOT start listening; server.js does that. (Tests can import this file.)

const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const securitiesRoutes = require('./routes/securities.routes');
const accountRoutes = require('./routes/account.routes');
const ordersRoutes = require('./routes/orders.routes');
const orderbookRoutes = require('./routes/orderbook.routes');
const tradesRoutes = require('./routes/trades.routes');

const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: '10kb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/securities', securitiesRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/orderbook', orderbookRoutes);
app.use('/api/trades', tradesRoutes);

// These two MUST stay last.
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;