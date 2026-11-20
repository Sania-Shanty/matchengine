import { formatRupees } from '../utils/format.js';

// Shows cash, reserved cash and available cash.
// If "holding" is given, also shows shares of that one security.
export default function BalanceCard({ account, holding, symbol }) {
  if (!account) {
    return (
      <div className="card">
        <h3>Your balance</h3>
        <p className="muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Your balance</h3>
      <dl className="stats">
        <div>
          <dt>Cash</dt>
          <dd>{formatRupees(account.cashBalance)}</dd>
        </div>
        <div>
          <dt>Reserved by open buys</dt>
          <dd>{formatRupees(account.reservedBalance)}</dd>
        </div>
        <div>
          <dt>Available to spend</dt>
          <dd className="strong">{formatRupees(account.availableBalance)}</dd>
        </div>
        {holding !== undefined && (
          <div>
            <dt>{symbol} shares (available / owned)</dt>
            <dd className="strong">
              {holding ? `${holding.availableQuantity} / ${holding.quantity}` : '0 / 0'}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}