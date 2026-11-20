-- Accounts: one cash wallet per user.
--
-- cash_balance     = all the money the account owns
-- reserved_balance = the part of that money locked up by open BUY orders
-- available money  = cash_balance - reserved_balance
CREATE TABLE accounts (
    id               BIGSERIAL PRIMARY KEY,
    user_id          BIGINT NOT NULL REFERENCES users(id),
    cash_balance     NUMERIC(20,2) NOT NULL DEFAULT 0,
    reserved_balance NUMERIC(20,2) NOT NULL DEFAULT 0,
    CONSTRAINT accounts_one_per_user UNIQUE (user_id),
    CONSTRAINT accounts_cash_not_negative CHECK (cash_balance >= 0),
    CONSTRAINT accounts_reserved_not_negative CHECK (reserved_balance >= 0),
    CONSTRAINT accounts_reserved_within_cash CHECK (reserved_balance <= cash_balance)
);