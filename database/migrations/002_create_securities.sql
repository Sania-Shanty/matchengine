-- Securities: the tradable stocks (RELIANCE, TCS, ...).
CREATE TABLE securities (
    id     BIGSERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    name   TEXT NOT NULL,
    CONSTRAINT securities_symbol_unique UNIQUE (symbol)
);