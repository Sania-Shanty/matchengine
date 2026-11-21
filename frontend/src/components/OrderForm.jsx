import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatPaise, formatRupees, parsePaise } from '../utils/format.js';

const MAX_PRICE_PAISE = 100000000n; // Rs. 1,000,000.00
const MAX_QUANTITY = 1000000;

export default function OrderForm({ symbol, bestBid, bestAsk, onPlaced }) {
  const { user } = useAuth();
  const toast = useToast();

  const [side, setSide] = useState('buy');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');
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

  const priceError = !priceOk
    ? price === ''
      ? 'Enter a price.'
      : 'Use a price above 0 with at most 2 decimals, for example 100.50.'
    : '';
  const quantityError = !quantityOk
    ? quantity === ''
      ? 'Enter a quantity.'
      : `Use a whole number from 1 to ${MAX_QUANTITY.toLocaleString()}.`
    : '';

  function edit(setter) {
    return (event) => {
      setter(event.target.value);
      setConfirming(false);
      setServerError('');
    };
  }

  function handleReview(event) {
    event.preventDefault();
    setShowErrors(true);
    setServerError('');
    if (!priceOk || !quantityOk) return;
    setConfirming(true);
  }

  async function handleConfirm() {
    setBusy(true);
    setServerError('');
    try {
      const data = await api.placeOrder({
        symbol,
        side,
        price: formatPaise(pricePaise),
        quantity: Number(quantity),
      });
      setResult(data);
      setConfirming(false);
      setQuantity('');
      setShowErrors(false);

      toast.success(
        data.trades.length === 0
          ? `Order #${data.order.id} is resting on the book.`
          : `Order #${data.order.id} traded ${data.trades
              .map((t) => `${t.quantity} @ ${formatRupees(t.price)}`)
              .join(', ')}.`
      );
    } catch (err) {
      setConfirming(false);
      setServerError(err.message);
      toast.error(err.message);
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
          onClick={() => {
            setSide('buy');
            setConfirming(false);
          }}
        >
          Buy
        </button>
        <button
          type="button"
          className={side === 'sell' ? 'active sell' : ''}
          onClick={() => {
            setSide('sell');
            setConfirming(false);
          }}
        >
          Sell
        </button>
      </div>

      <form onSubmit={handleReview} noValidate>
        <div className="field">
          <label htmlFor="order-price">Limit price (₹)</label>
          <input
            id="order-price"
            type="text"
            inputMode="decimal"
            placeholder="100.00"
            value={price}
            onChange={edit(setPrice)}
            className={showErrors && priceError ? 'invalid' : ''}
          />
          {showErrors && priceError && <p className="field-error">{priceError}</p>}
          <div className="quick-fill">
            <button type="button" disabled={!bestBid} onClick={() => bestBid && setPrice(bestBid)}>
              Best bid {bestBid ? formatRupees(bestBid) : '—'}
            </button>
            <button type="button" disabled={!bestAsk} onClick={() => bestAsk && setPrice(bestAsk)}>
              Best ask {bestAsk ? formatRupees(bestAsk) : '—'}
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="order-quantity">Quantity</label>
          <input
            id="order-quantity"
            type="text"
            inputMode="numeric"
            placeholder="10"
            value={quantity}
            onChange={edit(setQuantity)}
            className={showErrors && quantityError ? 'invalid' : ''}
          />
          {showErrors && quantityError && <p className="field-error">{quantityError}</p>}
        </div>

        {total !== null && !confirming && (
          <p className="hint">
            {side === 'buy'
              ? `Order value ${formatRupees(formatPaise(total))}. Up to this much cash is set aside.`
              : `Order value ${formatRupees(formatPaise(total))}. ${quantity} of your ${symbol} shares are set aside.`}
          </p>
        )}

        {serverError && <p className="alert alert-error">{serverError}</p>}

        {confirming && total !== null ? (
          <div className="confirm-box">
            <p>
              <strong>
                {side === 'buy' ? 'Buy' : 'Sell'} {quantity} {symbol}
              </strong>{' '}
              at {formatRupees(formatPaise(pricePaise))} each
              <br />
              <span className="muted">Order value {formatRupees(formatPaise(total))}</span>
            </p>
            <div className="row">
              <button type="button" className={`btn ${side}`} disabled={busy} onClick={handleConfirm}>
                {busy ? 'Placing...' : 'Confirm order'}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                Edit
              </button>
            </div>
          </div>
        ) : (
          <button type="submit" className={`btn btn-wide ${side}`}>
            Review {side} order
          </button>
        )}
      </form>

      {result && (
        <div className="alert alert-ok">
          <strong>Order #{result.order.id} accepted.</strong>{' '}
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