import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import usePolling from '../hooks/usePolling.js';
import OrderBook from '../components/OrderBook.jsx';
import TradeTape from '../components/TradeTape.jsx';
import OrderForm from '../components/OrderForm.jsx';
import MyOrdersTable from '../components/MyOrdersTable.jsx';
import BalanceCard from '../components/BalanceCard.jsx';

export default function TradePage() {
  const { symbol: rawSymbol } = useParams();
  const symbol = rawSymbol.toUpperCase();
  const { user } = useAuth();
  const userId = user ? user.id : null;

  // Public data, refreshed every 2 seconds.
  const book = usePolling(() => api.orderBook(symbol), 2000, [symbol]);
  const tape = usePolling(() => api.trades(symbol, 30), 2000, [symbol]);

  // Private data, only fetched when logged in.
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
    book.refresh();
    tape.refresh();
    myOrders.refresh();
    account.refresh();
    holdings.refresh();
  }

  if (book.error && book.error.status === 404) {
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

  return (
    <div>
      <div className="page-head">
        <h2>{symbol}</h2>
        <Link to="/">← All securities</Link>
      </div>

      {book.error && <p className="alert alert-error">{book.error.message}</p>}

      <div className="grid-trade">
        <div className="column">
          <OrderBook
            bids={book.data ? book.data.bids : []}
            asks={book.data ? book.data.asks : []}
          />
          <TradeTape trades={tape.data ? tape.data.trades : []} />
        </div>

        <div className="column">
          {user && (
            <BalanceCard
              account={account.data ? account.data.account : null}
              holding={myHolding}
              symbol={symbol}
            />
          )}
          <OrderForm symbol={symbol} onPlaced={refreshAll} />
          {user && <MyOrdersTable orders={myOrders.data ? myOrders.data.orders : []} />}
        </div>
      </div>
    </div>
  );
}