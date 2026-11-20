import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import usePolling from '../hooks/usePolling.js';
import { formatRupees } from '../utils/format.js';

async function loadMarket() {
  const { securities } = await api.securities();

  return Promise.all(
    securities.map(async (security) => {
      const [book, tape] = await Promise.all([
        api.orderBook(security.symbol),
        api.trades(security.symbol, 1),
      ]);
      return {
        ...security,
        bestBid: book.bids.length > 0 ? book.bids[0].price : null,
        bestAsk: book.asks.length > 0 ? book.asks[0].price : null,
        lastPrice: tape.trades.length > 0 ? tape.trades[0].price : null,
      };
    })
  );
}

export default function MarketPage() {
  const market = usePolling(loadMarket, 3000, []);

  return (
    <div>
      <h2>Market</h2>
      <p className="muted">
        Pick a security to see its live order book and place orders. Prices refresh every few
        seconds.
      </p>

      {market.error && <p className="alert alert-error">{market.error.message}</p>}
      {market.loading && !market.data && <p className="muted">Loading...</p>}

      {market.data && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                <th className="num">Best bid</th>
                <th className="num">Best ask</th>
                <th className="num">Last trade</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {market.data.map((row) => (
                <tr key={row.symbol}>
                  <td>
                    <Link to={`/trade/${row.symbol}`}>
                      <strong>{row.symbol}</strong>
                    </Link>
                  </td>
                  <td>{row.name}</td>
                  <td className="num buy-text">{formatRupees(row.bestBid)}</td>
                  <td className="num sell-text">{formatRupees(row.bestAsk)}</td>
                  <td className="num">{formatRupees(row.lastPrice)}</td>
                  <td className="num">
                    <Link className="btn btn-small" to={`/trade/${row.symbol}`}>
                      Trade
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}