import { formatRupees, formatTime, parseAmount } from '../utils/format.js';
import { EmptyState, SkeletonRows } from './States.jsx';

// Trades arrive newest first. Each price is coloured by comparing it with the trade before it.
function direction(trades, index) {
  const older = trades[index + 1];
  if (!older) return 'flat';
  const now = parseAmount(trades[index].price);
  const before = parseAmount(older.price);
  if (now === null || before === null || now === before) return 'flat';
  return now > before ? 'up' : 'down';
}

export default function TradeTape({ trades = [], loading = false }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>Recent trades</h3>
        <span className="muted small">Newest first</span>
      </div>

      {loading ? (
        <SkeletonRows count={5} />
      ) : trades.length === 0 ? (
        <EmptyState title="No trades yet">A trade appears here when a buy meets a sell.</EmptyState>
      ) : (
        <table className="table compact">
          <thead>
            <tr>
              <th>Time</th>
              <th className="num">Price</th>
              <th className="num">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, index) => (
              <tr key={trade.id}>
                <td className="muted">{formatTime(trade.executedAt)}</td>
                <td className={`num tick-${direction(trades, index)}`}>
                  {formatRupees(trade.price)}
                </td>
                <td className="num">{trade.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}