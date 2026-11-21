import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import usePolling from '../hooks/usePolling.js';
import { changePercent, formatRupees } from '../utils/format.js';
import { EmptyState, ErrorState, SkeletonRows } from '../components/States.jsx';

export default function MarketPage() {
  const market = usePolling(() => api.market(), 3000, []);
  const [search, setSearch] = useState('');

  const rows = market.data ? market.data.market : null;
  const visible = rows
    ? rows.filter((row) =>
        `${row.symbol} ${row.name}`.toLowerCase().includes(search.trim().toLowerCase())
      )
    : [];

  const totalVolume = rows ? rows.reduce((sum, row) => sum + row.volume24h, 0) : 0;
  const withBook = rows ? rows.filter((row) => row.bestBid || row.bestAsk).length : 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Market</h2>
          <p className="muted">Pick a security to see its live order book and place orders.</p>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat-card">
          <span>Securities</span>
          <strong>{rows ? rows.length : '—'}</strong>
        </div>
        <div className="stat-card">
          <span>With open orders</span>
          <strong>{rows ? withBook : '—'}</strong>
        </div>
        <div className="stat-card">
          <span>Shares traded (24h)</span>
          <strong>{rows ? totalVolume.toLocaleString() : '—'}</strong>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>All securities</h3>
          <input
            className="search"
            type="search"
            placeholder="Search symbol or name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search securities"
          />
        </div>

        {market.error && !rows ? (
          <ErrorState error={market.error} onRetry={market.refresh} title="Could not load the market" />
        ) : !rows ? (
          <SkeletonRows count={5} />
        ) : visible.length === 0 ? (
          <EmptyState title="No securities match your search">Try a different symbol or name.</EmptyState>
        ) : (
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Name</th>
                  <th className="num">Last trade</th>
                  <th className="num">Change</th>
                  <th className="num">Best bid</th>
                  <th className="num">Best ask</th>
                  <th className="num">Volume 24h</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const change = changePercent(row.lastPrice, row.previousPrice);
                  return (
                    <tr key={row.symbol}>
                      <td>
                        <Link to={`/trade/${row.symbol}`}>
                          <strong>{row.symbol}</strong>
                        </Link>
                      </td>
                      <td>{row.name}</td>
                      <td className="num">{formatRupees(row.lastPrice)}</td>
                      <td className={`num tick-${change ? change.direction : 'flat'}`}>
                        {change ? change.text : '—'}
                      </td>
                      <td className="num buy-text">{formatRupees(row.bestBid)}</td>
                      <td className="num sell-text">{formatRupees(row.bestAsk)}</td>
                      <td className="num">{row.volume24h.toLocaleString()}</td>
                      <td className="num">
                        <Link className="btn btn-small" to={`/trade/${row.symbol}`}>
                          Trade
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {market.error && rows && (
          <p className="alert alert-error">
            Showing the last data we received. Updating failed: {market.error.message}
          </p>
        )}
      </div>
    </div>
  );
}