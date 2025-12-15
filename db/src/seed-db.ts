const { Client } = require('pg');

const client = new Client({
    user: 'your_user',
    host: 'localhost',
    database: 'my_database',
    password: 'your_password',
    port: 5432,
});

// Set to true to insert mock historical data, false for empty DB (live data only)
const INSERT_MOCK_DATA = process.env.MOCK_DATA !== 'false';

async function initializeDB() {
    await client.connect();
    console.log(`\n📊 Initializing database... (Mock data: ${INSERT_MOCK_DATA ? 'YES' : 'NO'})\n`);

    // Create tata_prices table (hypertable for time-series data)
    await client.query(`
        DROP TABLE IF EXISTS "tata_prices" CASCADE;
        CREATE TABLE "tata_prices"(
            time            TIMESTAMP WITH TIME ZONE NOT NULL,
            price           DOUBLE PRECISION,
            volume          DOUBLE PRECISION,
            currency_code   VARCHAR (10)
        );
        
        SELECT create_hypertable('tata_prices', 'time', 'price', 2);
    `);
    console.log("Created tata_prices table");

    // Create orders table
    await client.query(`
        DROP TABLE IF EXISTS "orders" CASCADE;
        CREATE TABLE "orders"(
            id              VARCHAR(50) PRIMARY KEY,
            user_id         VARCHAR(50),
            market          VARCHAR(20) NOT NULL,
            side            VARCHAR(4) NOT NULL,
            price           DOUBLE PRECISION NOT NULL,
            quantity        DOUBLE PRECISION NOT NULL,
            executed_qty    DOUBLE PRECISION DEFAULT 0,
            status          VARCHAR(20) DEFAULT 'open',
            created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX idx_orders_user ON orders(user_id);
        CREATE INDEX idx_orders_market ON orders(market);
        CREATE INDEX idx_orders_status ON orders(status);
    `);
    console.log("Created orders table");

    // Create trades table (with user info)
    await client.query(`
        DROP TABLE IF EXISTS "trades" CASCADE;
        CREATE TABLE "trades"(
            id              VARCHAR(50) PRIMARY KEY,
            market          VARCHAR(20) NOT NULL,
            price           DOUBLE PRECISION NOT NULL,
            quantity        DOUBLE PRECISION NOT NULL,
            quote_quantity  DOUBLE PRECISION NOT NULL,
            buyer_user_id   VARCHAR(50),
            seller_user_id  VARCHAR(50),
            is_buyer_maker  BOOLEAN,
            created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX idx_trades_market ON trades(market);
        CREATE INDEX idx_trades_buyer ON trades(buyer_user_id);
        CREATE INDEX idx_trades_seller ON trades(seller_user_id);
        CREATE INDEX idx_trades_time ON trades(created_at DESC);
    `);
    console.log("Created trades table");

    // Create ticker table (current price for each market)
    await client.query(`
        DROP TABLE IF EXISTS "tickers" CASCADE;
        CREATE TABLE "tickers"(
            symbol          VARCHAR(20) PRIMARY KEY,
            last_price      DOUBLE PRECISION,
            high_24h        DOUBLE PRECISION,
            low_24h         DOUBLE PRECISION,
            volume_24h      DOUBLE PRECISION DEFAULT 0,
            price_change    DOUBLE PRECISION DEFAULT 0,
            price_change_percent DOUBLE PRECISION DEFAULT 0,
            updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    `);
    console.log("Created tickers table");

    // Insert initial ticker for TATA_INR
    await client.query(`
        INSERT INTO tickers (symbol, last_price, high_24h, low_24h, volume_24h, price_change)
        VALUES ('TATA_INR', 1000, 1050, 950, 0, 0)
        ON CONFLICT (symbol) DO NOTHING;
    `);
    console.log("Inserted initial ticker");

    // Create materialized views for klines (candlestick data)
    await client.query(`
        CREATE MATERIALIZED VIEW IF NOT EXISTS klines_1m AS
        SELECT
            time_bucket('1 minute', time) AS bucket,
            first(price, time) AS open,
            max(price) AS high,
            min(price) AS low,
            last(price, time) AS close,
            sum(volume) AS volume,
            currency_code
        FROM tata_prices
        GROUP BY bucket, currency_code;
    `);
    console.log("Created klines_1m materialized view");

    await client.query(`
        CREATE MATERIALIZED VIEW IF NOT EXISTS klines_1h AS
        SELECT
            time_bucket('1 hour', time) AS bucket,
            first(price, time) AS open,
            max(price) AS high,
            min(price) AS low,
            last(price, time) AS close,
            sum(volume) AS volume,
            currency_code
        FROM tata_prices
        GROUP BY bucket, currency_code;
    `);
    console.log("Created klines_1h materialized view");

    await client.query(`
        CREATE MATERIALIZED VIEW IF NOT EXISTS klines_1w AS
        SELECT
            time_bucket('1 week', time) AS bucket,
            first(price, time) AS open,
            max(price) AS high,
            min(price) AS low,
            last(price, time) AS close,
            sum(volume) AS volume,
            currency_code
        FROM tata_prices
        GROUP BY bucket, currency_code;
    `);
    console.log("Created klines_1w materialized view");

    // Insert sample historical data for the chart (last 7 days) - OPTIONAL
    if (INSERT_MOCK_DATA) {
        console.log("Inserting sample price data...");
        const now = new Date();
        let price = 1000;
        
        for (let i = 168; i >= 0; i--) { // 168 hours = 7 days
            const time = new Date(now.getTime() - i * 60 * 60 * 1000); // Go back i hours
            
            // Simulate price movement
            price = price + (Math.random() - 0.5) * 20;
            price = Math.max(900, Math.min(1100, price)); // Keep between 900-1100
            
            // Insert multiple trades per hour for realistic candles
            for (let j = 0; j < 10; j++) {
                const tradeTime = new Date(time.getTime() + j * 5 * 60 * 1000); // 5 min intervals
                const tradePrice = price + (Math.random() - 0.5) * 5;
                const volume = Math.random() * 100 + 10;
                
                await client.query(
                    'INSERT INTO tata_prices (time, price, volume, currency_code) VALUES ($1, $2, $3, $4)',
                    [tradeTime, tradePrice, volume, 'TATA_INR']
                );
            }
        }
        console.log("Sample data inserted successfully");
    } else {
        console.log("⏭️  Skipping mock data (MOCK_DATA=false). Database will start empty for live data only.");
    }

    // Refresh materialized views
    await client.query('REFRESH MATERIALIZED VIEW klines_1m');
    await client.query('REFRESH MATERIALIZED VIEW klines_1h');
    await client.query('REFRESH MATERIALIZED VIEW klines_1w');
    console.log("Materialized views refreshed");

    // Update ticker with sample data stats
    if (INSERT_MOCK_DATA) {
        await client.query(`
            UPDATE tickers SET
                high_24h = (SELECT MAX(price) FROM tata_prices WHERE time > NOW() - INTERVAL '24 hours'),
                low_24h = (SELECT MIN(price) FROM tata_prices WHERE time > NOW() - INTERVAL '24 hours'),
                volume_24h = (SELECT COALESCE(SUM(volume), 0) FROM tata_prices WHERE time > NOW() - INTERVAL '24 hours'),
                last_price = (SELECT price FROM tata_prices ORDER BY time DESC LIMIT 1)
            WHERE symbol = 'TATA_INR';
        `);
        console.log("Ticker updated with sample data stats");
    }

    await client.end();
    console.log("\n✅ Database initialized successfully!");
    console.log("\n📝 Next steps:");
    if (!INSERT_MOCK_DATA) {
        console.log("   1. Start all services (engine, api, ws, db, frontend)");
        console.log("   2. Run: cd scripts && npx ts-node generate-trades.ts");
        console.log("   3. The cron job will refresh views automatically");
    }
}

initializeDB().catch(console.error);
