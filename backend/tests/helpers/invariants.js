// The "must ALWAYS be true" rules, checked directly against the database.
// Each function returns a list of problems. An empty list means all is well.
// Tests assert:  expect(await checkInvariants(...)).toEqual([])

const { ownerPool } = require('./testDb');

// Pairs of [description, SQL that returns the ids of every offending row].
function buildChecks() {
  const FLOWS = `
    SELECT id AS trade_id, buy_order_id AS order_id, executed_quantity AS q
      FROM trades WHERE security_id = $1
    UNION ALL
    SELECT id, sell_order_id, executed_quantity
      FROM trades WHERE security_id = $1`;

  return [
    {
      name: 'an order has remaining_quantity outside 0..quantity',
      uses: 'security',
      sql: `SELECT id FROM orders
             WHERE security_id = $1
               AND NOT (remaining_quantity >= 0 AND remaining_quantity <= quantity)`,
    },
    {
      name: 'an order status disagrees with its remaining quantity',
      uses: 'security',
      sql: `SELECT id FROM orders
             WHERE security_id = $1
               AND ((status = 'filled' AND remaining_quantity <> 0)
                 OR (status IN ('open', 'partial') AND remaining_quantity <= 0))`,
    },
    {
      name: 'executed quantity + remaining quantity <> original quantity',
      uses: 'security',
      sql: `SELECT o.id
              FROM orders o
              LEFT JOIN (
                SELECT order_id, SUM(q)::int AS executed
                  FROM (${FLOWS}) x
                 GROUP BY order_id
              ) e ON e.order_id = o.id
             WHERE o.security_id = $1
               AND o.quantity - o.remaining_quantity <> COALESCE(e.executed, 0)`,
    },
    {
      name: 'a trade has a bad quantity, a price outside both limits, or trades with itself',
      uses: 'security',
      sql: `SELECT t.id
              FROM trades t
              JOIN orders b ON b.id = t.buy_order_id
              JOIN orders s ON s.id = t.sell_order_id
             WHERE t.security_id = $1
               AND (t.executed_quantity <= 0
                 OR t.executed_price > b.price
                 OR t.executed_price < s.price
                 OR b.account_id = s.account_id)`,
    },
    {
      name: 'an order was filled for more than its quantity (running total of trades)',
      uses: 'security',
      sql: `SELECT order_id AS id
              FROM (
                SELECT o.id AS order_id, o.quantity,
                       SUM(x.q) OVER (PARTITION BY o.id ORDER BY x.trade_id) AS running
                  FROM orders o
                  JOIN (${FLOWS}) x ON x.order_id = o.id
                 WHERE o.security_id = $1
              ) r
             WHERE running > quantity`,
    },
    {
      name: 'the order book is crossed (a live bid is at or above a live ask)',
      uses: 'security',
      sql: `SELECT b.id
              FROM orders b
              JOIN orders s
                ON s.security_id = b.security_id
               AND b.side = 'buy'  AND b.status IN ('open', 'partial')
               AND s.side = 'sell' AND s.status IN ('open', 'partial')
               AND b.price >= s.price
             WHERE b.security_id = $1`,
    },
    {
      name: 'an account has negative cash or reserved cash above its cash',
      uses: 'accounts',
      sql: `SELECT id FROM accounts
             WHERE id = ANY($1::bigint[])
               AND (cash_balance < 0 OR reserved_balance < 0 OR reserved_balance > cash_balance)`,
    },
    {
      name: 'a holding has negative shares or reserved shares above its shares',
      uses: 'accounts',
      sql: `SELECT id FROM holdings
             WHERE account_id = ANY($1::bigint[])
               AND (quantity < 0 OR reserved_quantity < 0 OR reserved_quantity > quantity)`,
    },
    {
      name: "an account's reserved cash differs from the value of its open buy orders",
      uses: 'accounts',
      sql: `SELECT a.id FROM accounts a
             WHERE a.id = ANY($1::bigint[])
               AND a.reserved_balance <> COALESCE((
                     SELECT SUM(o.price * o.remaining_quantity)
                       FROM orders o
                      WHERE o.account_id = a.id
                        AND o.side = 'buy'
                        AND o.status IN ('open', 'partial')
                   ), 0)`,
    },
    {
      name: "a holding's reserved shares differ from the size of its open sell orders",
      uses: 'accounts',
      sql: `SELECT h.id FROM holdings h
             WHERE h.account_id = ANY($1::bigint[])
               AND h.reserved_quantity <> COALESCE((
                     SELECT SUM(o.remaining_quantity)
                       FROM orders o
                      WHERE o.account_id = h.account_id
                        AND o.security_id = h.security_id
                        AND o.side = 'sell'
                        AND o.status IN ('open', 'partial')
                   ), 0)`,
    },
  ];
}

async function checkInvariants({ securityId, accountIds = [] }) {
  const problems = [];

  for (const check of buildChecks()) {
    const params = check.uses === 'security' ? [securityId] : [accountIds];
    const result = await ownerPool.query(check.sql, params);
    if (result.rowCount > 0) {
      problems.push(`${check.name}: ids ${result.rows.map((row) => row.id).join(', ')}`);
    }
  }

  return problems;
}

// Every trader's cash and shares must equal:
//   what they started with  +/-  exactly what the trades say they paid or received.
// If money or shares were ever created, lost or double-counted, this finds it.
async function checkLedger({ securityId, traders }) {
  const result = await ownerPool.query(
    `WITH initial AS (
       SELECT * FROM unnest($1::bigint[], $2::numeric[], $3::int[])
         AS i(account_id, cash, shares)
     ),
     flows AS (
       SELECT bo.account_id,
              -(t.executed_price * t.executed_quantity) AS cash,
              t.executed_quantity AS shares
         FROM trades t JOIN orders bo ON bo.id = t.buy_order_id
        WHERE t.security_id = $4
       UNION ALL
       SELECT so.account_id,
              t.executed_price * t.executed_quantity,
              -t.executed_quantity
         FROM trades t JOIN orders so ON so.id = t.sell_order_id
        WHERE t.security_id = $4
     ),
     net AS (
       SELECT account_id, SUM(cash) AS cash, SUM(shares) AS shares
         FROM flows GROUP BY account_id
     )
     SELECT i.account_id AS id
       FROM initial i
       JOIN accounts a ON a.id = i.account_id
       LEFT JOIN holdings h ON h.account_id = i.account_id AND h.security_id = $4
       LEFT JOIN net n ON n.account_id = i.account_id
      WHERE a.cash_balance <> i.cash + COALESCE(n.cash, 0)
         OR COALESCE(h.quantity, 0) <> i.shares + COALESCE(n.shares, 0)`,
    [
      traders.map((t) => t.accountId),
      traders.map((t) => t.initialCash),
      traders.map((t) => t.initialShares),
      securityId,
    ]
  );

  return result.rowCount === 0
    ? []
    : [`cash or shares do not match the trade history for accounts: ${result.rows.map((r) => r.id).join(', ')}`];
}

module.exports = { checkInvariants, checkLedger };