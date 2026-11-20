import { Link } from 'react-router-dom';
import { formatDateTime, formatRupees } from '../utils/format.js';

export default function MyOrdersTable({ orders = [], showSymbol = false }) {
  return (
    <div className="card">
      <h3>My orders</h3>
      {orders.length === 0 ? (
        <p className="muted small">You have no orders yet.</p>
      ) : (
        <div className="scroll-x">
          <table className="table compact">
            <thead>
              <tr>
                <th>ID</th>
                {showSymbol && <th>Symbol</th>}
                <th>Side</th>
                <th className="num">Price</th>
                <th className="num">Qty</th>
                <th className="num">Left</th>
                <th>Status</th>
                <th>Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="muted">#{order.id}</td>
                  {showSymbol && (
                    <td>
                      <Link to={`/trade/${order.symbol}`}>{order.symbol}</Link>
                    </td>
                  )}
                  <td className={order.side === 'buy' ? 'buy-text' : 'sell-text'}>
                    {order.side.toUpperCase()}
                  </td>
                  <td className="num">{formatRupees(order.price)}</td>
                  <td className="num">{order.quantity}</td>
                  <td className="num">{order.remainingQuantity}</td>
                  <td>
                    <span className={`badge badge-${order.status}`}>{order.status}</span>
                  </td>
                  <td className="muted">{formatDateTime(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}