# Deliberately excluded

Features MatchEngine does not build, and why. These are documented future extensions,
not committed scope. Deciding this in week one is part of the design.

## Excluded from the original proposal

| Feature | Why it is excluded | What it would take |
|---|---|---|
| **WebSockets / push updates** | Polling every 2 seconds gives a "live" feel with far less machinery. Correctness of matching does not depend on how the screen updates. | A WebSocket server broadcasting a message after each committed transaction, and a client hook replacing `usePolling`. |
| **Order cancellation** | It adds a second operation that races with matching. It needs its own rules and tests. | A `cancel` endpoint that locks the order row, releases its reservation and sets `status = 'cancelled'`. Then test cancel against a concurrent match: exactly one must win, in a documented way. This is the proposal's stretch test. |
| **Load testing at scale** | The benchmark compares two lock modes at a modest size. Large-scale testing needs infrastructure beyond a student project. | k6 or autocannon against a deployed instance, with a proper connection-pool and hardware study. |

## Excluded because they are outside the core engine

| Feature | Why it is excluded |
|---|---|
| **Market orders** | They need a rule for what happens when the book is empty or thin. Limit orders are enough to show price-time priority. |
| **Stop and other order types** | Each type adds trigger logic unrelated to the concurrency requirement. |
| **Modifying an open order** | Same difficulty as cancellation, plus priority rules for changed orders. |
| **Fees, taxes, settlement delay** | Real money concerns that do not affect the matching problem. |
| **Short selling and margin** | Requires negative holdings and risk checks. The schema forbids negative holdings on purpose. |
| **Price bands and trading hours** | Market-regulation features, not engine features. |
| **Real market data** | Prices are set only by users' orders. |

## Excluded security and operations work

| Feature | Note |
|---|---|
| Password reset, email verification | Needs an email service. |
| Rate limiting and account lockout | Worth adding before any public deployment. |
| JWT refresh tokens and revocation | The 12-hour token is enough for a demo. |
| HTTPS, hosting and CI/CD | The project runs locally. |
| Admin console | Securities are added by SQL seed. |
| Secrets management | `.env` is local only and is in `.gitignore`. |