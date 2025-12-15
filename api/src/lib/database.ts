/**
 * Database Layer with ACID Transaction Support
 * Uses PostgreSQL with connection pooling
 */

import { Pool, PoolClient } from 'pg';

// Connection pool for production scalability
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'my_database',
    user: process.env.POSTGRES_USER || 'your_user',
    password: process.env.POSTGRES_PASSWORD || 'your_password',
    max: 20,                    // Maximum connections in pool
    idleTimeoutMillis: 30000,   // Close idle connections after 30s
    connectionTimeoutMillis: 2000,
});

// Health check
pool.on('error', (err) => {
    console.error('Unexpected database error:', err);
});

/**
 * Execute a query with automatic connection handling
 */
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const start = Date.now();
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (duration > 100) {
        console.warn(`Slow query (${duration}ms):`, text);
    }
    
    return result.rows;
}

/**
 * Execute multiple queries in a single ACID transaction
 * Ensures all-or-nothing execution
 */
export async function withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>
): Promise<T> {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Execute a trade with full ACID compliance
 * Ensures balance updates are atomic
 */
export async function executeTradeTransaction(
    buyerId: string,
    sellerId: string,
    market: string,
    price: number,
    quantity: number,
    tradeId: string
): Promise<{ success: boolean; error?: string }> {
    return withTransaction(async (client) => {
        const [baseAsset, quoteAsset] = market.split('_');
        const totalCost = price * quantity;
        
        // Lock rows for update (prevents race conditions)
        const buyerBalance = await client.query(
            `SELECT * FROM user_balances 
             WHERE user_id = $1 AND asset = $2 
             FOR UPDATE`,
            [buyerId, quoteAsset]
        );
        
        const sellerBalance = await client.query(
            `SELECT * FROM user_balances 
             WHERE user_id = $1 AND asset = $2 
             FOR UPDATE`,
            [sellerId, baseAsset]
        );
        
        // Verify sufficient funds
        if (!buyerBalance.rows[0] || buyerBalance.rows[0].locked < totalCost) {
            throw new Error('Buyer has insufficient locked funds');
        }
        
        if (!sellerBalance.rows[0] || sellerBalance.rows[0].locked < quantity) {
            throw new Error('Seller has insufficient locked shares');
        }
        
        // Execute the trade atomically
        
        // 1. Deduct from buyer's locked INR
        await client.query(
            `UPDATE user_balances 
             SET locked = locked - $1, updated_at = NOW() 
             WHERE user_id = $2 AND asset = $3`,
            [totalCost, buyerId, quoteAsset]
        );
        
        // 2. Add to seller's available INR
        await client.query(
            `UPDATE user_balances 
             SET available = available + $1, updated_at = NOW() 
             WHERE user_id = $2 AND asset = $3`,
            [totalCost, sellerId, quoteAsset]
        );
        
        // 3. Deduct from seller's locked shares
        await client.query(
            `UPDATE user_balances 
             SET locked = locked - $1, updated_at = NOW() 
             WHERE user_id = $2 AND asset = $3`,
            [quantity, sellerId, baseAsset]
        );
        
        // 4. Add to buyer's available shares
        await client.query(
            `UPDATE user_balances 
             SET available = available + $1, updated_at = NOW() 
             WHERE user_id = $2 AND asset = $3`,
            [quantity, buyerId, baseAsset]
        );
        
        // 5. Record the trade
        await client.query(
            `INSERT INTO trades 
             (id, market, price, quantity, quote_quantity, buyer_user_id, seller_user_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [tradeId, market, price, quantity, totalCost, buyerId, sellerId]
        );
        
        return { success: true };
    });
}

/**
 * Lock funds for order with ACID compliance
 */
export async function lockFundsForOrder(
    userId: string,
    asset: string,
    amount: number,
    orderId: string
): Promise<{ success: boolean; error?: string }> {
    return withTransaction(async (client) => {
        // Lock the row for update
        const balance = await client.query(
            `SELECT * FROM user_balances 
             WHERE user_id = $1 AND asset = $2 
             FOR UPDATE`,
            [userId, asset]
        );
        
        if (!balance.rows[0] || balance.rows[0].available < amount) {
            throw new Error('Insufficient available balance');
        }
        
        // Move from available to locked
        await client.query(
            `UPDATE user_balances 
             SET available = available - $1, 
                 locked = locked + $1, 
                 updated_at = NOW() 
             WHERE user_id = $2 AND asset = $3`,
            [amount, userId, asset]
        );
        
        // Record the lock
        await client.query(
            `INSERT INTO balance_locks (order_id, user_id, asset, amount, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [orderId, userId, asset, amount]
        );
        
        return { success: true };
    });
}

/**
 * Unlock funds when order is cancelled
 */
export async function unlockFundsForOrder(
    userId: string,
    asset: string,
    amount: number,
    orderId: string
): Promise<{ success: boolean }> {
    return withTransaction(async (client) => {
        // Move from locked back to available
        await client.query(
            `UPDATE user_balances 
             SET available = available + $1, 
                 locked = locked - $1, 
                 updated_at = NOW() 
             WHERE user_id = $2 AND asset = $3`,
            [amount, userId, asset]
        );
        
        // Remove the lock record
        await client.query(
            `DELETE FROM balance_locks WHERE order_id = $1`,
            [orderId]
        );
        
        return { success: true };
    });
}

/**
 * Get user balance with read consistency
 */
export async function getUserBalance(userId: string): Promise<Record<string, { available: number; locked: number }>> {
    const result = await query(
        `SELECT asset, available, locked 
         FROM user_balances 
         WHERE user_id = $1`,
        [userId]
    );
    
    const balances: Record<string, { available: number; locked: number }> = {};
    result.forEach((row: any) => {
        balances[row.asset] = {
            available: parseFloat(row.available),
            locked: parseFloat(row.locked)
        };
    });
    
    return balances;
}

export { pool };

