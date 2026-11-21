import { formatPaise, formatRupees, parsePaise } from '../utils/format.js';
import { SkeletonRows } from './States.jsx';

function Row({ level, side, max }) {
  const width = `${Math.round((level.quantity / max) * 100)}%`;
  return (
    <div className={`ob-row ${side}`}>
      <div className="ob-bar" style={{ width }} />
      <span className="ob-price">{formatRupees(level.price)}</span>
      <span>{level.quantity}</span>
      <span className="muted">{level.orders}</span>
    </div>
  );
}

// A ladder: asks (sellers) on top, bids (buyers) below, the spread in the middle.
// The coloured bar behind each row shows its size compared with the biggest level (market depth).
export default function OrderBook({ bids = [], asks = [], loading = false }) {
  const max = Math.max(1, ...bids.map((b) => b.quantity), ...asks.map((a) => a.quantity));
  const asksTopDown = [...asks].reverse(); // cheapest ask nearest the middle

  let spread = null;
  if (bids.length > 0 && asks.length > 0) {
    const bid = parsePaise(bids[0].price);
    const ask = parsePaise(asks[0].price);
    if (bid !== null && ask !== null) spread = formatPaise(ask - bid);
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Order book</h3>
        <span className="muted small">Live depth</span>
      </div>

      <div className="ob-head">
        <span>Price</span>
        <span>Quantity</span>
        <span>Orders</span>
      </div>

      {loading ? (
        <SkeletonRows count={6} />
      ) : (
        <>
          {asksTopDown.length === 0 && <p className="ob-empty">No sell orders</p>}
          {asksTopDown.map((level) => (
            <Row key={`a-${level.price}`} level={level} side="ask" max={max} />
          ))}

          <div className="ob-spread">
            {spread !== null ? `Spread ${formatRupees(spread)}` : 'No spread yet'}
          </div>

          {bids.map((level) => (
            <Row key={`b-${level.price}`} level={level} side="bid" max={max} />
          ))}
          {bids.length === 0 && <p className="ob-empty">No buy orders</p>}
        </>
      )}
    </div>
  );
}