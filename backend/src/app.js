// Builds the Express application: the "switchboard" that connects everything.
// It does NOT start listening; server.js does that. (Tests can import this file.)

const fs = require('fs');
const path = require('path');
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
const marketRoutes = require('./routes/market.routes');

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
app.use('/api/market', marketRoutes);

// Anything under /api that matched nothing above is a JSON 404.
app.use('/api', notFoundHandler);

// If the React app has been built (frontend/dist exists), serve it too.
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
  app.use(express.static(frontendDist));
  // Any other page address (like /trade/TCS) gets index.html; React Router takes over.
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// These two MUST stay last.
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;