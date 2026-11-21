import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import usePolling from '../hooks/usePolling.js';
import { formatPaise, formatRupees, parseAmount } from '../utils/format.js';
import MyOrdersTable from '../components/MyOrdersTable.jsx';
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from '../components/States.jsx';

const COLORS = ['#1f4fd8', '#0f9d58', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

export default function PortfolioPage() {
  const account = usePolling(() => api.account(), 3000, []);
  const holdings = usePolling(() => api.holdings(), 3000, []);
  const orders = usePolling(() => api.orders(), 3000, []);
  const market = usePolling(() => api.market(), 3000, []);

  const failure = account.error || holdings.error || market.error;
  const ready = account.data && holdings.data && market.data;

  if (failure && !ready) {
    return (
      <div>
        <h2>Portfolio</h2>
        <div className="card">
          <ErrorState
            error={failure}
            title="Could not load your portfolio"
            onRetry={() => {
              account.refresh();
              holdings.refresh();
              market.refresh();
              orders.refresh();
            }}
          />
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div>
        <h2>Portfolio</h2>
        <div className="stat-strip">
          {[0, 1, 2, 3].map((i) => (
            <div className="stat-card" key={i}>
              <Skeleton height={14} width="50%" />
              <Skeleton height={26} width="80%" style={{ marginTop: 8 }} />
            </div>
          ))}
        </div>
        <div className="card">
          <SkeletonRows count={5} />
        </div>
      </div>
    );
  }

  // Each share is valued at the last trade price (or the best bid if it never traded).
  const prices = new Map(
    market.data.market.map((m) => [m.symbol, m.lastPrice || m.bestBid || null])
  );

  let holdingsValue = 0n;
  const rows = holdings.data.holdings.map((h) => {
    const price = prices.get(h.symbol) || null;
    const parsed = price ? parseAmount(price) : null;
    const value = parsed !== null ? parsed * BigInt(h.quantity) : null;
    if (value !== null) holdingsValue += value;
    return { ...h, price, value };
  });
  const unpriced = rows.filter((r) => r.value === null && r.quantity > 0).length;

  const cash = parseAmount(account.data.account.cashBalance) || 0n;
  const total = cash + holdingsValue;

  // Allocation bar (widths are only for drawing, so plain numbers are fine here).
  const share = (part) => (total > 0n ? Number((part * 10000n) / total) / 100 : 0);
  const segments = [
    { label: 'Cash', value: cash, color: '#94a3b8' },
    ...rows
      .filter((r) => r.value !== null && r.value > 0n)
      .map((r, index) => ({ label: r.symbol, value: r.value, color: COLORS[index % COLORS.length] })),
  ].filter((s) => s.value > 0n);

  return (
    <div>
      <div className="page-head">
        <h2>Portfolio</h2>
      </div>

      {failure && (
        <p className="alert alert-error">Showing the last data we received. Updating failed: {failure.message}</p>
      )}

      <div className="stat-strip">
        <div className="stat-card accent">
          <span>Total value</span>
          <strong>{formatRupees(formatPaise(total))}</strong>
          <em className="muted">Cash + shares at last price</em>
        </div>
        <div className="stat-card">
          <span>Available cash</span>
          <strong>{formatRupees(account.data.account.availableBalance)}</strong>
        </div>
        <div className="stat-card">
          <span>Reserved by open buys</span>
          <strong>{formatRupees(account.data.account.reservedBalance)}</strong>
        </div>
        <div className="stat-card">
          <span>Shares value</span>
          <strong>{formatRupees(formatPaise(holdingsValue))}</strong>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Allocation</h3>
        </div>
        <div className="alloc-bar">
          {segments.map((s) => (
            <div
              key={s.label}
              className="alloc-seg"
              style={{ width: `${share(s.value)}%`, background: s.color }}
              title={`${s.label} ${share(s.value).toFixed(1)}%`}
            />
          ))}
        </div>
        <div className="alloc-legend">
          {segments.map((s) => (
            <span key={s.label}>
              <i style={{ background: s.color }} />
              {s.label} {share(s.value).toFixed(1)}%
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Shares you own</h3>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="You own no shares">Buy a security from the market to see it here.</EmptyState>
        ) : (
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Name</th>
                  <th className="num">Owned</th>
                  <th className="num">Reserved by sells</th>
                  <th className="num">Available</th>
                  <th className="num">Last price</th>
                  <th className="num">Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
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
                    <td className="num">{formatRupees(h.price)}</td>
                    <td className="num">{h.value !== null ? formatRupees(formatPaise(h.value)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {unpriced > 0 && (
          <p className="hint">
            {unpriced} holding(s) show "—" because that security has never traded and has no bid yet, so
            it is not counted in the total.
          </p>
        )}
      </div>

      <MyOrdersTable
        orders={orders.data ? orders.data.orders : []}
        loading={!orders.data && !orders.error}
        showSymbol
      />
    </div>
  );
}