/**
 * Script to generate real trades for the candle chart
 * Run this to populate the orderbook and create trades
 * 
 * Usage: npx ts-node scripts/generate-trades.ts
 */

import axios from 'axios';

const API_URL = 'http://localhost:3000/api/v1';

interface OrderResponse {
    orderId: string;
    executedQty: number;
    fills: any[];
}

async function placeOrder(
    market: string,
    price: string,
    quantity: string,
    side: 'buy' | 'sell',
    userId: string
): Promise<OrderResponse> {
    const response = await axios.post(`${API_URL}/order`, {
        market,
        price,
        quantity,
        side,
        userId
    });
    return response.data;
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateTrades() {
    console.log('🚀 Starting trade generation for TATA_INR...\n');

    const market = 'TATA_INR';
    let basePrice = 1000;
    let totalVolume = 0;
    let tradeCount = 0;

    try {
        // First, place some sell orders at various prices (user 2)
        console.log('📊 Placing initial sell orders...');
        for (let i = 0; i < 10; i++) {
            const price = (basePrice + i * 2).toString();
            const quantity = (Math.random() * 50 + 10).toFixed(2);
            await placeOrder(market, price, quantity, 'sell', '2');
            console.log(`  Sell order: ${quantity} @ ${price}`);
        }

        // Place some buy orders at various prices (user 1)
        console.log('\n📊 Placing initial buy orders...');
        for (let i = 0; i < 10; i++) {
            const price = (basePrice - i * 2).toString();
            const quantity = (Math.random() * 50 + 10).toFixed(2);
            await placeOrder(market, price, quantity, 'buy', '1');
            console.log(`  Buy order: ${quantity} @ ${price}`);
        }

        console.log('\n💹 Generating matching trades...\n');

        // Generate trades by crossing the spread
        while (totalVolume < 1000) {
            // Simulate price movement
            const priceChange = (Math.random() - 0.5) * 10;
            basePrice = Math.max(950, Math.min(1050, basePrice + priceChange));
            const price = basePrice.toFixed(2);
            const quantity = (Math.random() * 30 + 5).toFixed(2);

            // Alternate between buy and sell to create trades
            const side = tradeCount % 2 === 0 ? 'buy' : 'sell';
            const userId = side === 'buy' ? '1' : '2';

            try {
                const result = await placeOrder(market, price, quantity, side, userId);
                
                if (result.executedQty > 0) {
                    totalVolume += result.executedQty;
                    tradeCount++;
                    console.log(`✅ Trade #${tradeCount}: ${side.toUpperCase()} ${result.executedQty} @ ${price} | Total Volume: ${totalVolume.toFixed(2)}`);
                } else {
                    console.log(`📝 Order placed in book: ${side.toUpperCase()} ${quantity} @ ${price}`);
                }
            } catch (error: any) {
                console.log(`⚠️ Order failed: ${error.response?.data?.error || error.message}`);
            }

            // Small delay between orders
            await sleep(100);
        }

        console.log('\n✨ Trade generation complete!');
        console.log(`📈 Total trades: ${tradeCount}`);
        console.log(`📊 Total volume: ${totalVolume.toFixed(2)} TATA`);
        console.log('\n⏳ Wait for cron job to refresh materialized views (10 seconds)');
        console.log('🔄 Then refresh your browser to see the new candles!');

    } catch (error: any) {
        console.error('❌ Error:', error.response?.data || error.message);
        console.log('\n⚠️ Make sure these services are running:');
        console.log('  1. Engine: cd engine && npm run dev');
        console.log('  2. API: cd api && npm run dev');
        console.log('  3. Redis: docker-compose up -d');
    }
}

generateTrades();

