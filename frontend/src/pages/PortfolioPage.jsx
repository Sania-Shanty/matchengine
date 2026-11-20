import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import usePolling from '../hooks/usePolling.js';
import BalanceCard from '../components/BalanceCard.jsx';
import MyOrdersTable from '../components/MyOrdersTable.jsx';

export default function PortfolioPage() {
  const account = usePolling(() => api.account(), 3000, []);
  const holdings = usePolling(() => api.holdings(), 3000, []);
  const orders = usePolling(() => api.orders(), 3000, []);

  const failure = account.error || holdings.error || orders.error;

  return (
    <div>
      <h2>Portfolio</h2>

      {failure && <p className="alert alert-error">{failure.message}</p>}

      <BalanceCard account={account.data ? account.data.account : null} />

      <div className="card">
        <h3>Shares you own</h3>
        {!holdings.data ? (
          <p className="muted small">Loading...</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                <th className="num">Owned</th>
                <th className="num">Reserved by open sells</th>
                <th className="num">Available</th>
              </tr>
            </thead>
            <tbody>
              {holdings.data.holdings.map((h) => (
                <tr key={h.symbol}>
                  <td>
                    <Link to={`/trade/${h.symbol}`}>
                      <strong>{h.symbol}</strong>
                    </Link>
                  </td>
                  <td>{h.name}</td>
                  <td className="num">{h.quantity}</td>
                  <td className="num">{h.reservedQuantity}</td>
                  <td className="num">{h.availableQuantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <MyOrdersTable orders={orders.data ? orders.data.orders : []} showSymbol />
    </div>
  );
}