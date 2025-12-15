-- ============================================
-- PRODUCTION DATABASE SCHEMA
-- Exchange Platform with ACID Compliance
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "timescaledb";

-- ============================================
-- USERS & AUTHENTICATION
-- ============================================

CREATE TABLE users (
    id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'trader', 'admin', 'super_admin')),
    kyc_status VARCHAR(20) DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'in_review', 'verified', 'rejected')),
    is_active BOOLEAN DEFAULT true,
    is_2fa_enabled BOOLEAN DEFAULT false,
    two_fa_secret VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    login_attempts INT DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_kyc ON users(kyc_status);

-- Refresh tokens for JWT
CREATE TABLE refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);

-- KYC Documents
CREATE TABLE kyc_documents (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL, -- 'aadhaar', 'pan', 'passport', 'bank_statement'
    document_number VARCHAR(100),
    document_url VARCHAR(500),
    status VARCHAR(20) DEFAULT 'pending',
    verified_by VARCHAR(50),
    verified_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- BALANCES & WALLETS
-- ============================================

CREATE TABLE user_balances (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL REFERENCES users(id),
    asset VARCHAR(20) NOT NULL,
    available DECIMAL(20, 8) DEFAULT 0 CHECK (available >= 0),
    locked DECIMAL(20, 8) DEFAULT 0 CHECK (locked >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, asset)
);

CREATE INDEX idx_balances_user ON user_balances(user_id);
CREATE INDEX idx_balances_asset ON user_balances(asset);

-- Balance locks for orders
CREATE TABLE balance_locks (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL REFERENCES users(id),
    asset VARCHAR(20) NOT NULL,
    amount DECIMAL(20, 8) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_locks_order ON balance_locks(order_id);
CREATE INDEX idx_locks_user ON balance_locks(user_id);

-- ============================================
-- ORDERS & TRADES
-- ============================================

CREATE TABLE orders (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL REFERENCES users(id),
    market VARCHAR(20) NOT NULL,
    side VARCHAR(4) NOT NULL CHECK (side IN ('buy', 'sell')),
    order_type VARCHAR(10) DEFAULT 'limit' CHECK (order_type IN ('limit', 'market', 'stop_limit')),
    price DECIMAL(20, 8),
    quantity DECIMAL(20, 8) NOT NULL,
    filled_quantity DECIMAL(20, 8) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'partial', 'filled', 'cancelled', 'expired')),
    time_in_force VARCHAR(10) DEFAULT 'GTC' CHECK (time_in_force IN ('GTC', 'IOC', 'FOK')),
    stop_price DECIMAL(20, 8),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    filled_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_market ON orders(market);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);

-- Trades (executions)
CREATE TABLE trades (
    id VARCHAR(50) PRIMARY KEY,
    market VARCHAR(20) NOT NULL,
    price DECIMAL(20, 8) NOT NULL,
    quantity DECIMAL(20, 8) NOT NULL,
    quote_quantity DECIMAL(20, 8) NOT NULL,
    buyer_user_id VARCHAR(50) REFERENCES users(id),
    seller_user_id VARCHAR(50) REFERENCES users(id),
    buyer_order_id VARCHAR(50) REFERENCES orders(id),
    seller_order_id VARCHAR(50) REFERENCES orders(id),
    is_buyer_maker BOOLEAN,
    fee DECIMAL(20, 8) DEFAULT 0,
    fee_asset VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_trades_market ON trades(market);
CREATE INDEX idx_trades_buyer ON trades(buyer_user_id);
CREATE INDEX idx_trades_seller ON trades(seller_user_id);
CREATE INDEX idx_trades_time ON trades(created_at DESC);

-- Convert to TimescaleDB hypertable for time-series optimization
SELECT create_hypertable('trades', 'created_at', if_not_exists => TRUE);

-- ============================================
-- PRICE DATA (Candlesticks)
-- ============================================

CREATE TABLE price_ticks (
    time TIMESTAMP WITH TIME ZONE NOT NULL,
    market VARCHAR(20) NOT NULL,
    price DECIMAL(20, 8) NOT NULL,
    volume DECIMAL(20, 8) NOT NULL,
    trade_id VARCHAR(50)
);

SELECT create_hypertable('price_ticks', 'time', if_not_exists => TRUE);

-- Materialized views for candlesticks
CREATE MATERIALIZED VIEW klines_1m AS
SELECT
    time_bucket('1 minute', time) AS bucket,
    market,
    first(price, time) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, time) AS close,
    sum(volume) AS volume
FROM price_ticks
GROUP BY bucket, market
WITH NO DATA;

CREATE MATERIALIZED VIEW klines_1h AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    market,
    first(price, time) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, time) AS close,
    sum(volume) AS volume
FROM price_ticks
GROUP BY bucket, market
WITH NO DATA;

CREATE MATERIALIZED VIEW klines_1d AS
SELECT
    time_bucket('1 day', time) AS bucket,
    market,
    first(price, time) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, time) AS close,
    sum(volume) AS volume
FROM price_ticks
GROUP BY bucket, market
WITH NO DATA;

-- ============================================
-- DEPOSITS & WITHDRAWALS
-- ============================================

CREATE TABLE deposits (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL REFERENCES users(id),
    asset VARCHAR(20) NOT NULL DEFAULT 'INR',
    amount DECIMAL(20, 8) NOT NULL,
    payment_method VARCHAR(50), -- 'upi', 'netbanking', 'imps', 'neft'
    transaction_id VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed', 'cancelled')),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_deposits_user ON deposits(user_id);
CREATE INDEX idx_deposits_status ON deposits(status);

CREATE TABLE withdrawals (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL REFERENCES users(id),
    asset VARCHAR(20) NOT NULL DEFAULT 'INR',
    amount DECIMAL(20, 8) NOT NULL,
    fee DECIMAL(20, 8) DEFAULT 0,
    bank_account VARCHAR(50),
    ifsc_code VARCHAR(20),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_withdrawals_user ON withdrawals(user_id);
CREATE INDEX idx_withdrawals_status ON withdrawals(status);

-- ============================================
-- MARKETS & TICKERS
-- ============================================

CREATE TABLE markets (
    symbol VARCHAR(20) PRIMARY KEY,
    base_asset VARCHAR(10) NOT NULL,
    quote_asset VARCHAR(10) NOT NULL,
    min_price DECIMAL(20, 8) DEFAULT 0.01,
    max_price DECIMAL(20, 8) DEFAULT 999999999,
    min_quantity DECIMAL(20, 8) DEFAULT 0.0001,
    tick_size DECIMAL(20, 8) DEFAULT 0.01,
    lot_size DECIMAL(20, 8) DEFAULT 0.0001,
    maker_fee DECIMAL(10, 6) DEFAULT 0.001,  -- 0.1%
    taker_fee DECIMAL(10, 6) DEFAULT 0.001,  -- 0.1%
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE tickers (
    symbol VARCHAR(20) PRIMARY KEY REFERENCES markets(symbol),
    last_price DECIMAL(20, 8),
    bid_price DECIMAL(20, 8),
    ask_price DECIMAL(20, 8),
    high_24h DECIMAL(20, 8),
    low_24h DECIMAL(20, 8),
    volume_24h DECIMAL(20, 8),
    quote_volume_24h DECIMAL(20, 8),
    price_change_24h DECIMAL(20, 8),
    price_change_percent_24h DECIMAL(10, 4),
    open_price DECIMAL(20, 8),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- AUDIT TRAIL
-- ============================================

CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id VARCHAR(100),
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_time ON audit_logs(created_at DESC);

-- ============================================
-- INSERT DEFAULT DATA
-- ============================================

-- Default market
INSERT INTO markets (symbol, base_asset, quote_asset)
VALUES ('TATA_INR', 'TATA', 'INR')
ON CONFLICT DO NOTHING;

-- Default ticker
INSERT INTO tickers (symbol, last_price, high_24h, low_24h, volume_24h)
VALUES ('TATA_INR', 1000, 1050, 950, 0)
ON CONFLICT DO NOTHING;

