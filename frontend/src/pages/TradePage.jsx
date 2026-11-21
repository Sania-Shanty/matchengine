import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import usePolling from '../hooks/usePolling.js';
import { changePercent, formatRupees } from '../utils/format.js';
import OrderBook from '../components/OrderBook.jsx';
import TradeTape from '../components/TradeTape.jsx';
import OrderForm from '../components/OrderForm.jsx';
import MyOrdersTable from '../components/MyOrdersTable.jsx';
import BalanceCard from '../components/BalanceCard.jsx';
import { ErrorState } from '../components/States.jsx';

export default function TradePage() {
  const { symbol: rawSymbol } = useParams();
  const symbol = rawSymbol.toUpperCase();
  const { user } = useAuth();
  const userId = user ? user.id : null;

  // Public data, refreshed every 2 seconds.
  const market = usePolling(() => api.market(), 2000, [symbol]);
  const book = usePolling(() => api.orderBook(symbol), 2000, [symbol]);
  const tape = usePolling(() => api.trades(symbol, 30), 2000, [symbol]);

  // Private data, only fetched when logged in. The user id is in the dependency
  // list, so switching users throws the old user's data away immediately.
  const myOrders = usePolling(
    () => (userId ? api.orders(symbol) : Promise.resolve({ orders: [] })),
    2000,
    [symbol, userId]
  );
  const account = usePolling(
    () => (userId ? api.account() : Promise.resolve(null)),
    2000,
    [userId]
  );
  const holdings = usePolling(
    () => (userId ? api.holdings() : Promise.resolve(null)),
    2000,
    [userId]
  );

  function refreshAll() {
    market.refresh();
    book.refresh();
    tape.refresh();
    myOrders.refresh();
    account.refresh();
    holdings.refresh();
  }

  const summary =
    market.data && market.data.market ? market.data.market.find((s) => s.symbol === symbol) : null;

  if (
    (book.error && book.error.status === 404) ||
    (market.data && market.data.market && !summary)
  ) {
    return (
      <div className="card narrow">
        <h2>Unknown security</h2>
        <p className="muted">There is no security called "{symbol}".</p>
        <Link to="/">Back to the market</Link>
      </div>
    );
  }

  const myHolding =
    holdings.data && holdings.data.holdings
      ? holdings.data.holdings.find((h) => h.symbol === symbol) || null
      : null;

  const change = summary ? changePercent(summary.lastPrice, summary.previousPrice) : null;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>
            {symbol} <span className="muted-title">{summary ? summary.name : ''}</span>
          </h2>
        </div>
        <Link to="/">← All securities</Link>
      </div>

      <div className="stat-strip">
        <div className="stat-card">
          <span>Last trade</span>
          <strong>{summary ? formatRupees(summary.lastPrice) : '—'}</strong>
          {change && <em className={`tick-${change.direction}`}>{change.text}</em>}
        </div>
        <div className="stat-card">
          <span>Best bid</span>
          <strong className="buy-text">{summary ? formatRupees(summary.bestBid) : '—'}</strong>
        </div>
        <div className="stat-card">
          <span>Best ask</span>
          <strong className="sell-text">{summary ? formatRupees(summary.bestAsk) : '—'}</strong>
        </div>
        <div className="stat-card">
          <span>Volume 24h</span>
          <strong>{summary ? summary.volume24h.toLocaleString() : '—'}</strong>
        </div>
      </div>

      {book.error && book.error.status !== 404 && (
        <ErrorState error={book.error} onRetry={book.refresh} title="Could not load the order book" />
      )}

      <div className="grid-trade">
        <div className="column">
          <OrderBook
            bids={book.data ? book.data.bids : []}
            asks={book.data ? book.data.asks : []}
            loading={!book.data && !book.error}
          />
          <TradeTape trades={tape.data ? tape.data.trades : []} loading={!tape.data && !tape.error} />
        </div>

        <div className="column">
          {user && (
            <BalanceCard
              account={account.data ? account.data.account : null}
              holding={holdings.data ? myHolding : undefined}
              symbol={symbol}
            />
          )}
          <OrderForm
            key={userId || 'guest'}
            symbol={symbol}
            bestBid={summary ? summary.bestBid : null}
            bestAsk={summary ? summary.bestAsk : null}
            onPlaced={refreshAll}
          />
          {user && (
            <MyOrdersTable
              orders={myOrders.data ? myOrders.data.orders : []}
              loading={!myOrders.data && !myOrders.error}
            />
          )}
        </div>
      </div>
    </div>
  );
}