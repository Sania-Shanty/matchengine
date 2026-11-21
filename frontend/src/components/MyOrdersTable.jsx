import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDateTime, formatRupees } from '../utils/format.js';
import { EmptyState, SkeletonRows } from './States.jsx';

const FILTERS = [
  ['all', 'All'],
  ['open', 'Open'],
  ['partial', 'Partly filled'],
  ['filled', 'Filled'],
];

export default function MyOrdersTable({ orders = [], showSymbol = false, loading = false }) {
  const [filter, setFilter] = useState('all');

  const count = (key) => (key === 'all' ? orders.length : orders.filter((o) => o.status === key).length);
  const visible = filter === 'all' ? orders : orders.filter((o) => o.status === filter);

  return (
    <div className="card">
      <div className="card-head">
        <h3>My orders</h3>
        <div className="chips">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`chip ${filter === key ? 'active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label} <span>{count(key)}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <SkeletonRows count={4} />
      ) : orders.length === 0 ? (
        <EmptyState title="You have no orders yet">
          Place a buy or sell order and it will show up here.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState title="Nothing in this filter">Try another status above.</EmptyState>
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
              {visible.map((order) => (
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