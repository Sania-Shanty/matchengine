import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { formatPaise, formatRupees, parsePaise } from '../utils/format.js';

const MAX_PRICE_PAISE = 100000000n; // Rs. 1,000,000.00
const MAX_QUANTITY = 1000000;

export default function OrderForm({ symbol, onPlaced }) {
  const { user } = useAuth();
  const [side, setSide] = useState('buy');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  if (!user) {
    return (
      <div className="card">
        <h3>Place an order</h3>
        <p className="muted">
          <Link to="/login">Log in</Link> or <Link to="/register">register</Link> to trade.
        </p>
      </div>
    );
  }

  const pricePaise = parsePaise(price);
  const priceOk = pricePaise !== null && pricePaise > 0n && pricePaise <= MAX_PRICE_PAISE;
  const quantityOk =
    /^\d{1,7}$/.test(quantity) && Number(quantity) >= 1 && Number(quantity) <= MAX_QUANTITY;
  const total = priceOk && quantityOk ? pricePaise * BigInt(quantity) : null;

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setResult(null);

    if (!priceOk) {
      setError('Enter a price above 0 with at most 2 decimal places (for example 100.50).');
      return;
    }
    if (!quantityOk) {
      setError(`Quantity must be a whole number from 1 to ${MAX_QUANTITY.toLocaleString()}.`);
      return;
    }

    setBusy(true);
    try {
      const data = await api.placeOrder({
        symbol,
        side,
        price: formatPaise(pricePaise),
        quantity: Number(quantity),
      });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (onPlaced) onPlaced();
    }
  }

  return (
    <div className="card">
      <h3>Place an order</h3>

      <div className="side-toggle">
        <button
          type="button"
          className={side === 'buy' ? 'active buy' : ''}
          onClick={() => setSide('buy')}
        >
          Buy
        </button>
        <button
          type="button"
          className={side === 'sell' ? 'active sell' : ''}
          onClick={() => setSide('sell')}
        >
          Sell
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <label>
          Limit price (₹)
          <input
            type="text"
            inputMode="decimal"
            placeholder="100.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>

        <label>
          Quantity
          <input
            type="text"
            inputMode="numeric"
            placeholder="10"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>

        {total !== null && (
          <p className="hint">
            {side === 'buy'
              ? `This order sets aside up to ${formatRupees(formatPaise(total))} of your cash.`
              : `This order sets aside ${quantity} of your ${symbol} shares.`}
          </p>
        )}

        {error && <p className="alert alert-error">{error}</p>}

        <button type="submit" className={`btn btn-wide ${side}`} disabled={busy}>
          {busy ? 'Placing...' : `Place ${side} order`}
        </button>
      </form>

      {result && (
        <div className="alert alert-ok">
          <strong>
            Order #{result.order.id} accepted.
          </strong>{' '}
          {result.trades.length === 0
            ? 'No match yet, so it is resting on the book.'
            : `It traded immediately: ${result.trades
                .map((t) => `${t.quantity} @ ${formatRupees(t.price)}`)
                .join(', ')}.`}
          {result.order.remainingQuantity > 0 &&
            result.trades.length > 0 &&
            ` ${result.order.remainingQuantity} still resting.`}
        </div>
      )}
    </div>
  );
}