# Design decisions

Why MatchEngine is built the way it is. Each section states the decision, the reason,
and where it lives in the code.

## 1. The database enforces the rules, not just the code

Every invariant that can be written as a constraint is one. Application code can have
a second code path, a bug or a migration. A constraint cannot be bypassed.

| Rule | Constraint |
|---|---|
| Cash never negative | `accounts_cash_not_negative` |
| Reserved cash never exceeds cash | `accounts_reserved_within_cash` |
| Shares never negative | `holdings_quantity_not_negative` |
| Reserved shares never exceed shares | `holdings_reserved_within_quantity` |
| `0 <= remaining <= quantity` | `orders_remaining_in_range` |
| Status tells the truth about remaining quantity | `orders_status_matches_quantity` |
| One holding row per account and security | `UNIQUE (account_id, security_id)` |
| A trade never matches an order with itself | `trades_different_orders` |

The `orders_status_matches_quantity` check goes beyond the original proposal: `open`
means nothing executed, `partial` means some executed and some remain, `filled` means
nothing remains. The database refuses to store an order whose status contradicts its
quantity.

Files: `database/migrations/003` to `006`. Proven by `database/scripts/verify_phase1.js`
and `backend/tests/integrity/schema-constraints.test.js`.

## 2. Money is never a floating-point number

- Stored as `NUMERIC(20,2)`.
- Calculated in Node as BigInt paise (`backend/src/utils/money.js`).
- Sent through the API as text (`"99.90"`).
- Handled on the screen as text or BigInt (`frontend/src/utils/format.js`).

In plain JavaScript `0.1 + 0.2` is not `0.3`. In a ledger that drift would make
balances wrong. The unit test `money.test.js` shows the problem and the fix.

## 3. How one order is processed

All steps run in ONE database transaction (`withTransaction`). Any error rolls back everything.

1. Look up the security.
2. Take the per-security advisory lock (`pg_advisory_xact_lock`).
3. Select candidate orders on the other side, ordered by `price, created_at, id`, with `FOR UPDATE`.
4. Lock every account involved, in ascending id order.
5. Reserve cash (buy) or shares (sell). Check and update are one SQL statement.
6. Insert the order, with `created_at = clock_timestamp()`.
7. Trade against the candidates one by one, best first.
8. Commit.

Files: `backend/src/services/order.service.js`, `backend/src/matching/*.js`.

## 4. Three layers of locking, and what each one is for

| Layer | What it protects against |
|---|---|
| **Advisory lock per security** | Two matchers working on the same book at once. Different securities still run in parallel. |
| **`FOR UPDATE` on candidate orders** | Two transactions consuming the same resting order. It is the mechanism written in the original proposal. |
| **Accounts locked in ascending id order** | Deadlock. If transaction 1 needed accounts 5 then 9 and transaction 2 needed 9 then 5, each would wait for the other. A fixed order makes that impossible. |

The benchmark (`docs/BENCHMARK_REPORT.md`) compares the first layer on and off.
Setting `MATCHING_LOCK_MODE=row` switches the advisory lock off.

## 5. A note about `ORDER BY ... FOR UPDATE` and snapshots

At the default READ COMMITTED isolation level, the candidate query sorts rows using a
snapshot taken when that statement starts. It then locks those rows and re-checks them.
Consequence: with row locks only, a better-priced order committed by another transaction
after the snapshot is not seen by this pass. The book can then briefly hold a buy and a
sell that cross.

With the advisory lock, a matcher takes the lock first and starts its candidate query
afterwards. Every previous order on that security has already committed, so the snapshot
is complete. This is the main reason the advisory lock is the default.

## 6. Funds and shares are reserved when an order is placed

Without reservation, a user with Rs. 1,000 could place ten buy orders of Rs. 1,000 each.
Nine would fail later, at match time, leaving orders on the book that can never be
honoured. Instead:

- A buy reserves `price x quantity` of cash, and refuses if available cash is too low.
- A sell reserves its shares, and refuses if available shares are too low.
- Available cash is `cash_balance - reserved_balance`.
- A trade at a better price than the buyer's limit releases the unused part.

File: `backend/src/matching/reserveFunds.js`. Proven by `tests/integrity/funds-reservation.test.js`.

## 7. Trades happen at the resting order's price

The order that was already waiting on the book sets the price. A buyer bidding 100
against a resting sell at 99 pays 99. This is the standard rule on real exchanges.
Your proposal does not specify a trade price, so this is a documented decision.

## 8. Self-trades are refused

If a new order would trade against the same account's own resting order, the whole new
order is rejected with `SELF_TRADE` (HTTP 409) and everything rolls back, including any
trades it made with other people before reaching its own order. The alternative designs
(skip your own order, or cancel the resting one) are more complex and change what the
user did not ask for.

## 9. Trades are append-only, enforced twice

- A trigger raises an error on `UPDATE`, `DELETE` and `TRUNCATE`. It works even for the database owner.
- `REVOKE UPDATE, DELETE, TRUNCATE` from the application role `app_user`.

The backend connects as `app_user`, never as the owner. Even a bug in the backend, or a
future code path, cannot rewrite trade history.

Because a trade is a single immutable row, the proposal's append-only history needs no
`seq` column here. Each trade is its own event and nothing is edited after it is written.

## 10. Timestamps and tie-breaks

`created_at` uses `clock_timestamp()`, the real time of insertion, not `now()`, which
is frozen at the start of a transaction. Ties on price are broken by `created_at`, and
any remaining tie by the auto-incrementing `id`. Matching is therefore fully
deterministic, even for two orders in the same millisecond.
Proven by `tests/concurrency/time-priority.test.js` with two identical timestamps.

## 11. Testing strategy

| Layer | What it checks |
|---|---|
| Scripted concurrency tests | Orders are fired in parallel from code with `Promise.all`. Browser tabs cannot hit a race window of a few milliseconds. |
| Invariants after every test | `checkInvariants` and `checkLedger` verify the rules directly in the database. They are properties, not examples. |
| Property-based test | `fast-check` generates random order sequences. A 30-line reference model computes what price-time priority should produce, and the real engine must match it exactly. |
| Integrity tests | Reservations, self-trade and the database constraints themselves. |

One adaptation of the proposal: "Buy 10 @ 100 resting, then Sell A @ 99, then Sell B @ 98"
cannot show "B executes first", because Sell A would trade immediately against the resting
buy. The tests instead let both sells rest and then send the buy, which is the real
"price beats time" rule. It is tested for both sides of the book.

## 12. Frontend

- React with Vite, plain CSS.
- "Live" data is polling every 2 to 3 seconds (`usePolling`). WebSockets are deliberately excluded.
- Market and Trade pages are public, as in the proposal ("everyone can view a live order book"). Portfolio needs login.
- Login is a JWT that expires after 12 hours, kept in `localStorage`.

## Known limitations

- A resting order stays on the book until it is filled, because cancellation is excluded. Its reservation stays too.
- Polling is not instant. A change can take up to 2 seconds to appear.
- Passwords and the JWT secret in `.env.example` are for local development only.

## Questions you should be able to answer

1. **Two sells race for one buy. Why can't both fill it?** The advisory lock lets only one order per security through at a time. The second waits, then sees the buy already filled. Underneath, `FOR UPDATE` on the buy row and the `remaining_quantity` CHECK would stop it even without the advisory lock.
2. **What stops a deadlock?** Accounts are always locked in ascending id order.
3. **Why is the advisory lock the default?** It removes the snapshot gap in section 5, and the benchmark shows what it costs.
4. **How do you know the order book is never crossed?** An invariant query after every test, plus the model comparison in the property test.
5. **Why not store the order status in code only?** Because a CHECK constraint cannot be bypassed by a second code path.
6. **Show me an UPDATE that corrupts trade history.** Run it as `app_user`: permission denied. Run it as the owner: the trigger raises an error.
7. **Why BigInt paise?** Floating point cannot represent 0.1 exactly.
8. **What would you do for 10,000 orders per second?** One matcher per security, an in-memory book, and the database used as the durable log. That is out of scope and listed in `DELIBERATELY_EXCLUDED.md`.