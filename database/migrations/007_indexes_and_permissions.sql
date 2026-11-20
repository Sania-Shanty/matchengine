-- =====================================================================
-- PART 1: Indexes (speed-ups)
-- =====================================================================

-- The matching query looks for open/partial orders of one security and side,
-- sorted by price, then time, then id. This index serves that exact query.
-- It only covers live orders, so it stays small.
CREATE INDEX idx_orders_matching
    ON orders (security_id, side, price, created_at, id)
    WHERE status IN ('open', 'partial') AND remaining_quantity > 0;

-- "Show me my orders"
CREATE INDEX idx_orders_account ON orders (account_id, created_at DESC);

-- "Show me recent trades for this security"
CREATE INDEX idx_trades_security_time ON trades (security_id, executed_at DESC);

-- "Which trades touched this order?"
CREATE INDEX idx_trades_buy_order ON trades (buy_order_id);
CREATE INDEX idx_trades_sell_order ON trades (sell_order_id);

-- "Show me my holdings"
CREATE INDEX idx_holdings_account ON holdings (account_id);

-- =====================================================================
-- PART 2: Append-only trades (a trigger that refuses changes)
-- This works even for the database owner.
-- =====================================================================

CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'append-only table: % is not permitted on %', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trades_no_update_delete
    BEFORE UPDATE OR DELETE ON trades
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER trades_no_truncate
    BEFORE TRUNCATE ON trades
    FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- =====================================================================
-- PART 3: A limited database user for the application
-- The backend will connect as "app_user", never as the owner.
-- NOTE: this password is for local development only.
-- =====================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user LOGIN PASSWORD 'app_password';
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_user;

GRANT SELECT, INSERT         ON users      TO app_user;
GRANT SELECT                 ON securities TO app_user;
GRANT SELECT, INSERT, UPDATE ON accounts   TO app_user;
GRANT SELECT, INSERT, UPDATE ON holdings   TO app_user;
GRANT SELECT, INSERT, UPDATE ON orders     TO app_user;
GRANT SELECT, INSERT         ON trades     TO app_user;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Spelled out on purpose: the app can never rewrite trade history.
REVOKE UPDATE, DELETE, TRUNCATE ON trades FROM app_user;