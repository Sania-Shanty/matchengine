import { formatRupees, formatTime } from '../utils/format.js';

export default function TradeTape({ trades = [] }) {
  return (
    <div className="card">
      <h3>Recent trades</h3>
      {trades.length === 0 ? (
        <p className="muted small">No trades yet.</p>
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
            {trades.map((trade) => (
              <tr key={trade.id}>
                <td className="muted">{formatTime(trade.executedAt)}</td>
                <td className="num">{formatRupees(trade.price)}</td>
                <td className="num">{trade.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}