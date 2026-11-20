-- Trades: a permanent record of every match.
-- This table is append-only: rows are inserted and never changed or removed.
-- Migration 007 enforces that rule inside the database.
CREATE TABLE trades (
    id                BIGSERIAL PRIMARY KEY,
    security_id       BIGINT NOT NULL REFERENCES securities(id),
    buy_order_id      BIGINT NOT NULL REFERENCES orders(id),
    sell_order_id     BIGINT NOT NULL REFERENCES orders(id),
    executed_price    NUMERIC(20,2) NOT NULL,
    executed_quantity INTEGER NOT NULL,
    executed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT trades_price_positive CHECK (executed_price > 0),
    CONSTRAINT trades_quantity_positive CHECK (executed_quantity > 0),
    CONSTRAINT trades_different_orders CHECK (buy_order_id <> sell_order_id)
);