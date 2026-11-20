-- Demo data. Safe to run more than once (it skips rows that already exist).

-- Lets the database create password hashes that our Node backend can read later.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Five tradable securities
INSERT INTO securities (symbol, name) VALUES
    ('RELIANCE', 'Reliance Industries'),
    ('TCS',      'Tata Consultancy Services'),
    ('INFY',     'Infosys'),
    ('HDFCBANK', 'HDFC Bank'),
    ('ITC',      'ITC Limited')
ON CONFLICT (symbol) DO NOTHING;

-- Four demo users. Every password is: password123
INSERT INTO users (email, full_name, password_hash) VALUES
    ('alice@example.com', 'Alice Demo', crypt('password123', gen_salt('bf', 10))),
    ('bob@example.com',   'Bob Demo',   crypt('password123', gen_salt('bf', 10))),
    ('carol@example.com', 'Carol Demo', crypt('password123', gen_salt('bf', 10))),
    ('dave@example.com',  'Dave Demo',  crypt('password123', gen_salt('bf', 10)))
ON CONFLICT (email) DO NOTHING;

-- Each demo user starts with Rs. 1,000,000.00 in cash
INSERT INTO accounts (user_id, cash_balance, reserved_balance)
SELECT id, 1000000.00, 0
FROM users
WHERE email IN ('alice@example.com', 'bob@example.com', 'carol@example.com', 'dave@example.com')
ON CONFLICT (user_id) DO NOTHING;

-- ...and 1,000 shares of every security
INSERT INTO holdings (account_id, security_id, quantity, reserved_quantity)
SELECT a.id, s.id, 1000, 0
FROM accounts a
JOIN users u ON u.id = a.user_id
CROSS JOIN securities s
WHERE u.email IN ('alice@example.com', 'bob@example.com', 'carol@example.com', 'dave@example.com')
ON CONFLICT (account_id, security_id) DO NOTHING;