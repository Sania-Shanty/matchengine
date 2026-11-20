-- Holdings: how many shares of each security an account owns.
--
-- quantity          = all the shares the account owns
-- reserved_quantity = the part of those shares locked up by open SELL orders
-- available shares  = quantity - reserved_quantity
CREATE TABLE holdings (
    id                BIGSERIAL PRIMARY KEY,
    account_id        BIGINT NOT NULL REFERENCES accounts(id),
    security_id       BIGINT NOT NULL REFERENCES securities(id),
    quantity          INTEGER NOT NULL DEFAULT 0,
    reserved_quantity INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT holdings_one_row_per_security UNIQUE (account_id, security_id),
    CONSTRAINT holdings_quantity_not_negative CHECK (quantity >= 0),
    CONSTRAINT holdings_reserved_not_negative CHECK (reserved_quantity >= 0),
    CONSTRAINT holdings_reserved_within_quantity CHECK (reserved_quantity <= quantity)
);