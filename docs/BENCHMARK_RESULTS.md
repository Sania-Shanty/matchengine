# Benchmark results

Generated: 2026-11-16T17:27:49.827Z

Settings: 300 random orders per run (prices 99 to 101, quantities 1 to 10), 16 orders in flight at once, 3 rounds per setting, 12 traders per security. Throughput and latency are medians over the rounds. The correctness columns are totals over all rounds.

## One security: every order contends for the same book

| Lock mode | Orders/sec | p50 latency (ms) | p95 latency (ms) | Trades per run | Refused (expected) | Unexpected errors | Crossed-book pairs | Broken invariants |
|---|---|---|---|---|---|---|---|---|
| advisory | 142.5 | 79.6 | 205.7 | 193 | 53 | 0 | 0 | 0 |
| row | 216.4 | 18.8 | 402.9 | 188 | 56 | 0 | 9 | 0 |

## Five securities: orders are spread across five books

| Lock mode | Orders/sec | p50 latency (ms) | p95 latency (ms) | Trades per run | Refused (expected) | Unexpected errors | Crossed-book pairs | Broken invariants |
|---|---|---|---|---|---|---|---|---|
| advisory | 259.9 | 35.1 | 177.0 | 177 | 51 | 0 | 0 | 0 |
| row | 258.6 | 29.2 | 233.8 | 173 | 55 | 0 | 5 | 0 |

## How to read this

- **Orders/sec** is how many orders were fully processed per second. Higher is faster.
- **Crossed-book pairs** counts live buy orders priced at or above a live sell order. A correct book has 0.
- **Broken invariants** counts orders whose executed + remaining quantity is wrong, and accounts or holdings whose reservation does not match their open orders. It must be 0.
- **Unexpected errors** counts failures other than the three business refusals (self-trade, insufficient funds, insufficient shares), for example deadlocks that survived 3 retries.
