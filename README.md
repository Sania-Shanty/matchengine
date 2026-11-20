# MatchEngine

A simplified stock exchange. Users trade virtual shares of a small set of securities
with virtual money. They place buy and sell **limit orders**, and the engine matches
compatible orders by **price-time priority** inside one atomic database transaction.
Anyone can view the live order book and trade history.

The project's hard requirement is **concurrency**: when competing orders arrive at the
same instant, one order can never be matched twice, filled beyond its quantity, or leave
the book inconsistent.

## Tech stack

React (Vite) · Node.js + Express · PostgreSQL · Vitest + fast-check · Postman

## Highlights

- **Correct under concurrency.** A per-security advisory lock, `FOR UPDATE` row locks, and accounts always locked in ascending id order.
- **Invariants live in the database.** CHECK and UNIQUE constraints reject impossible states.
- **Funds and shares are reserved** when an order is placed, so the book never holds orders that cannot be honoured.
- **Self-trade prevention** and fully deterministic tie-breaking (price, then time, then id).
- **Append-only trades**, enforced by a trigger and by revoked privileges.
- **Money is exact.** `NUMERIC(20,2)` in the database, BigInt paise in code, text in the API.
- **Property-based testing.** `fast-check` compares the real engine against a reference model on random order sequences.
- **Benchmark** of the advisory lock against row locks only.

## Architecture

```
React (Vite, port 5173)
        |  /api requests (forwarded by Vite)
        v
Express API (port 4000)
   routes -> controllers -> services -> matching engine
        |
        v
PostgreSQL  (connects as limited role "app_user")
   users, securities, accounts, holdings, orders, trades
```

## Setup (one time)

You need Node.js 20+ and PostgreSQL 16 installed.

```bash
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
cp .env.example .env          # Windows: copy .env.example .env
# edit .env: set your PostgreSQL password and a JWT_SECRET
npm run db:create
npm run db:migrate
npm run db:seed
npm run db:reset:test
npm run db:verify
```

## Run the app

Two terminals:

```bash
npm run dev:backend      # http://localhost:4000
npm run dev:frontend     # http://localhost:5173
```

Demo logins (password for all: `password123`): `alice@example.com`, `bob@example.com`,
`carol@example.com`, `dave@example.com`.

For a clean demo, stop nothing and run `npm run db:reset:demo` to empty the order book.

## Tests

```bash
npm test                          # all 11 test files (backend)
cd backend
npm run test:concurrency          # the scenarios from the proposal
npm run test:property             # property-based tests (more runs: $env:PROP_RUNS=500)
npm run test:integrity            # reservations, self-trade, database constraints
npm run test:unit                 # money arithmetic
```

Tests run on a separate test database that is rebuilt at the start of every run.

## API demo (Postman)

```bash
npm run postman:build
```

Import `postman/MatchEngine.postman_collection.json` into Postman. Run
`npm run db:reset:demo`, start the backend, then run the collection with the Collection
Runner. Every test should pass.

## Benchmark

```bash
npm run bench
```

Writes `docs/BENCHMARK_RESULTS.md`. Analysis is in `docs/BENCHMARK_REPORT.md`.

## API summary

| Method | Address | Login? | Purpose |
|---|---|---|---|
| GET | `/api/health` | No | Is the server alive |
| POST | `/api/auth/register` | No | Create a user with starting cash and shares |
| POST | `/api/auth/login` | No | Get a token |
| GET | `/api/auth/me` | Yes | Current user |
| GET | `/api/securities`, `/api/securities/:symbol` | No | Tradable stocks |
| GET | `/api/account`, `/api/account/holdings` | Yes | Cash and shares |
| POST | `/api/orders` | Yes | Place a limit order |
| GET | `/api/orders`, `/api/orders/:id` | Yes | My orders |
| GET | `/api/orderbook/:symbol` | No | Bids and asks by price level |
| GET | `/api/trades/:symbol` | No | Recent trades |

Errors have the form `{ "error": { "code": "...", "message": "..." } }`. Business refusals:
`INSUFFICIENT_FUNDS`, `INSUFFICIENT_SHARES`, `SELF_TRADE` (all HTTP 409).

## Documentation

- [Design decisions](docs/DESIGN_DECISIONS.md)
- [Deliberately excluded](docs/DELIBERATELY_EXCLUDED.md)
- [Benchmark report](docs/BENCHMARK_REPORT.md)

## Project structure

```
database/    migrations, seed data, setup and reset scripts
backend/     Express API, matching engine, Vitest test suite
frontend/    React app
postman/     API collection
scripts/     benchmark and Postman generator
docs/        design notes, exclusions, benchmark
```

## Project status

- [x] Phase 1: Database
- [x] Phase 2: Backend basics
- [x] Phase 3: Matching engine
- [x] Phase 4: Automated tests
- [x] Phase 5: React frontend
- [x] Phase 6: Postman, benchmark and documentation