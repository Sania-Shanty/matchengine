-- Orders: buy or sell requests waiting to be matched.
CREATE TABLE orders (
    id                 BIGSERIAL PRIMARY KEY,
    account_id         BIGINT NOT NULL REFERENCES accounts(id),
    security_id        BIGINT NOT NULL REFERENCES securities(id),
    side               TEXT NOT NULL,
    price              NUMERIC(20,2) NOT NULL,
    quantity           INTEGER NOT NULL,
    remaining_quantity INTEGER NOT NULL,
    status             TEXT NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT orders_side_valid CHECK (side IN ('buy', 'sell')),
    CONSTRAINT orders_price_positive CHECK (price > 0),
    CONSTRAINT orders_quantity_positive CHECK (quantity > 0),
    CONSTRAINT orders_remaining_in_range
        CHECK (remaining_quantity >= 0 AND remaining_quantity <= quantity),
    CONSTRAINT orders_status_valid
        CHECK (status IN ('open', 'partial', 'filled', 'cancelled')),

    -- Status must always tell the truth about the remaining quantity:
    --   open      -> nothing executed yet (remaining equals quantity)
    --   partial   -> some executed, some left
    --   filled    -> nothing left
    --   cancelled -> may have anything left
    CONSTRAINT orders_status_matches_quantity CHECK (
        (status = 'open'   AND remaining_quantity = quantity)
        OR (status = 'partial' AND remaining_quantity > 0 AND remaining_quantity < quantity)
        OR (status = 'filled'  AND remaining_quantity = 0)
        OR (status = 'cancelled')
    )
);