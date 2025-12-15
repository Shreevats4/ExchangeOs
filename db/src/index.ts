import { Client } from 'pg';
import { createClient } from 'redis';  
import { DbMessage } from './types';

const pgClient = new Client({
    user: 'your_user',
    host: 'localhost',
    database: 'my_database',
    password: 'your_password',
    port: 5432,
});
pgClient.connect();

async function main() {
    const redisClient = createClient();
    await redisClient.connect();
    console.log("connected to redis");

    while (true) {
        const response = await redisClient.rPop("db_processor" as string)
        if (!response) {
            // Small delay to prevent CPU spinning
            await new Promise(resolve => setTimeout(resolve, 100));
        } else {
            const data: DbMessage = JSON.parse(response);
            
            if (data.type === "TRADE_ADDED") {
                console.log("adding trade data");
                console.log(data);
                const price = data.data.price;
                const timestamp = new Date(data.data.timestamp);
                const volume = data.data.quantity; // Include volume
                const currencyCode = data.data.market;
                
                // Insert into tata_prices with volume
                const query = 'INSERT INTO tata_prices (time, price, volume, currency_code) VALUES ($1, $2, $3, $4)';
                const values = [timestamp, price, volume, currencyCode];
                
                try {
                    await pgClient.query(query, values);
                    console.log(`Trade saved: price=${price}, volume=${volume}`);
                } catch (error) {
                    console.error("Error inserting trade:", error);
                }

                // Also insert into trades table if it exists
                try {
                    const tradeQuery = `
                        INSERT INTO trades (id, market, price, quantity, quote_quantity, is_buyer_maker, created_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                        ON CONFLICT (id) DO NOTHING
                    `;
                    await pgClient.query(tradeQuery, [
                        data.data.id,
                        data.data.market,
                        data.data.price,
                        data.data.quantity,
                        data.data.quoteQuantity,
                        data.data.isBuyerMaker,
                        timestamp
                    ]);
                } catch (error) {
                    // Trades table might not exist yet, that's okay
                    if (!(error as any).message?.includes('does not exist')) {
                        console.error("Error inserting into trades:", error);
                    }
                }

                // Update ticker table
                try {
                    await updateTicker(currencyCode, parseFloat(price));
                } catch (error) {
                    // Ticker table might not exist yet
                }
            }
            
            if (data.type === "ORDER_UPDATE") {
                await handleOrderUpdate(data.data);
            }
        }
    }
}

async function handleOrderUpdate(data: any) {
    try {
        // Check if orders table exists and insert/update
        const query = `
            INSERT INTO orders (id, market, price, quantity, side, executed_qty, status, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (id) DO UPDATE SET
                executed_qty = orders.executed_qty + EXCLUDED.executed_qty,
                status = CASE 
                    WHEN orders.executed_qty + EXCLUDED.executed_qty >= orders.quantity THEN 'filled'
                    WHEN EXCLUDED.executed_qty > 0 THEN 'partial'
                    ELSE orders.status
                END,
                updated_at = NOW()
        `;
        await pgClient.query(query, [
            data.orderId,
            data.market || 'TATA_INR',
            data.price || 0,
            data.quantity || 0,
            data.side || 'buy',
            data.executedQty || 0,
            'open'
        ]);
        console.log(`Order updated: ${data.orderId}`);
    } catch (error) {
        // Orders table might not exist yet
        if (!(error as any).message?.includes('does not exist')) {
            console.error("Error updating order:", error);
        }
    }
}

async function updateTicker(symbol: string, lastPrice: number) {
    const query = `
        INSERT INTO tickers (symbol, last_price, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (symbol) DO UPDATE SET
            last_price = $2,
            high_24h = GREATEST(tickers.high_24h, $2),
            low_24h = LEAST(tickers.low_24h, $2),
            updated_at = NOW()
    `;
    await pgClient.query(query, [symbol, lastPrice]);
}

main();
