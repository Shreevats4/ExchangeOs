import { describe, it, expect, beforeEach } from "vitest";
import { Orderbook, Order } from "../trade/Orderbook";

/**
 * Simplified balance tracking for testing
 * Mirrors the Engine's balance management logic
 */
interface UserBalance {
    [asset: string]: {
        available: string;
        locked: string;
    };
}

function add(a: string, b: string): string {
    return (parseFloat(a) + parseFloat(b)).toString();
}

function subtract(a: string, b: string): string {
    return (parseFloat(a) - parseFloat(b)).toString();
}

function multiply(a: string, b: string): string {
    return (parseFloat(a) * parseFloat(b)).toString();
}

/**
 * Check and lock funds before order placement
 */
function checkAndLockFunds(
    balances: Map<string, UserBalance>,
    baseAsset: string,
    quoteAsset: string,
    side: "buy" | "sell",
    userId: string,
    price: string,
    quantity: string
): boolean {
    const userBalance = balances.get(userId);
    if (!userBalance) return false;

    if (side === "buy") {
        const required = multiply(quantity, price);
        const available = userBalance[quoteAsset]?.available || "0";
        
        if (parseFloat(available) < parseFloat(required)) {
            return false; // Insufficient funds
        }
        
        userBalance[quoteAsset].available = subtract(available, required);
        userBalance[quoteAsset].locked = add(userBalance[quoteAsset].locked || "0", required);
    } else {
        const available = userBalance[baseAsset]?.available || "0";
        
        if (parseFloat(available) < parseFloat(quantity)) {
            return false; // Insufficient funds
        }
        
        userBalance[baseAsset].available = subtract(available, quantity);
        userBalance[baseAsset].locked = add(userBalance[baseAsset].locked || "0", quantity);
    }
    return true;
}

/**
 * Update balances after order fills
 */
function updateBalance(
    balances: Map<string, UserBalance>,
    userId: string,
    baseAsset: string,
    quoteAsset: string,
    side: "buy" | "sell",
    fills: { qty: string; price: string; otherUserId: string }[]
) {
    if (side === "buy") {
        fills.forEach(fill => {
            const fillValue = multiply(fill.qty, fill.price);
            
            // Maker (seller) receives quote asset
            const makerBalance = balances.get(fill.otherUserId);
            if (makerBalance) {
                makerBalance[quoteAsset].available = add(makerBalance[quoteAsset].available, fillValue);
                makerBalance[baseAsset].locked = subtract(makerBalance[baseAsset].locked, fill.qty);
            }
            
            // Taker (buyer) pays quote asset, receives base asset
            const takerBalance = balances.get(userId);
            if (takerBalance) {
                takerBalance[quoteAsset].locked = subtract(takerBalance[quoteAsset].locked, fillValue);
                takerBalance[baseAsset].available = add(takerBalance[baseAsset].available, fill.qty);
            }
        });
    } else {
        fills.forEach(fill => {
            const fillValue = multiply(fill.qty, fill.price);
            
            // Maker (buyer) pays quote asset, receives base asset
            const makerBalance = balances.get(fill.otherUserId);
            if (makerBalance) {
                makerBalance[quoteAsset].locked = subtract(makerBalance[quoteAsset].locked, fillValue);
                makerBalance[baseAsset].available = add(makerBalance[baseAsset].available, fill.qty);
            }
            
            // Taker (seller) receives quote asset
            const takerBalance = balances.get(userId);
            if (takerBalance) {
                takerBalance[quoteAsset].available = add(takerBalance[quoteAsset].available, fillValue);
                takerBalance[baseAsset].locked = subtract(takerBalance[baseAsset].locked, fill.qty);
            }
        });
    }
}

describe("Balance Management", () => {
    let balances: Map<string, UserBalance>;
    let orderbook: Orderbook;

    beforeEach(() => {
        balances = new Map();
        
        // User 1: Has 10000 INR and 100 TATA shares
        balances.set("1", {
            INR: { available: "10000", locked: "0" },
            TATA: { available: "100", locked: "0" }
        });
        
        // User 2: Has 10000 INR and 100 TATA shares
        balances.set("2", {
            INR: { available: "10000", locked: "0" },
            TATA: { available: "100", locked: "0" }
        });

        orderbook = new Orderbook("TATA", [], [], 0, "0");
    });

    describe("BUY Order - Full Fill", () => {
        it("correctly updates balances when User 1 buys 10 TATA from User 2 at ₹100", () => {
            // Setup: User 2 has a sell order (ask) on the book
            const sellOrder: Order = {
                price: "100",
                quantity: "10",
                orderId: "sell-1",
                filled: "0",
                side: "sell",
                userId: "2"
            };

            // User 2 locks their TATA shares
            checkAndLockFunds(balances, "TATA", "INR", "sell", "2", "100", "10");
            
            expect(balances.get("2")!.TATA.available).toBe("90");  // 100 - 10
            expect(balances.get("2")!.TATA.locked).toBe("10");

            // Add sell order to book
            orderbook.asks.push(sellOrder);

            // User 1 places a buy order
            const buyPrice = "100";
            const buyQty = "10";
            
            // Lock funds for buy order
            const canBuy = checkAndLockFunds(balances, "TATA", "INR", "buy", "1", buyPrice, buyQty);
            expect(canBuy).toBe(true);
            
            expect(balances.get("1")!.INR.available).toBe("9000");  // 10000 - (10*100)
            expect(balances.get("1")!.INR.locked).toBe("1000");     // 10 * 100

            // Simulate the match
            const buyOrder: Order = {
                price: buyPrice,
                quantity: buyQty,
                orderId: "buy-1",
                filled: "0",
                side: "buy",
                userId: "1"
            };

            const result = orderbook.addOrder(buyOrder);
            
            expect(result.executedQty).toBe("10");
            expect(result.fills.length).toBe(1);
            expect(result.fills[0].qty).toBe("10");
            expect(result.fills[0].price).toBe("100");

            // Update balances based on fills
            const fills = result.fills.map(f => ({
                qty: f.qty,
                price: f.price,
                otherUserId: f.otherUserId
            }));
            
            updateBalance(balances, "1", "TATA", "INR", "buy", fills);

            // Verify User 1 (Buyer) balances
            expect(balances.get("1")!.INR.available).toBe("9000");  // Unchanged
            expect(balances.get("1")!.INR.locked).toBe("0");        // 1000 - 1000 = 0
            expect(balances.get("1")!.TATA.available).toBe("110");  // 100 + 10 = 110
            expect(balances.get("1")!.TATA.locked).toBe("0");       // Unchanged

            // Verify User 2 (Seller) balances
            expect(balances.get("2")!.INR.available).toBe("11000"); // 10000 + 1000 = 11000
            expect(balances.get("2")!.INR.locked).toBe("0");        // Unchanged
            expect(balances.get("2")!.TATA.available).toBe("90");   // Unchanged
            expect(balances.get("2")!.TATA.locked).toBe("0");       // 10 - 10 = 0

            console.log("\n=== BUY Order Full Fill ===");
            console.log("User 1 (Buyer):", balances.get("1"));
            console.log("User 2 (Seller):", balances.get("2"));
        });
    });

    describe("SELL Order - Full Fill", () => {
        it("correctly updates balances when User 1 sells 10 TATA to User 2 at ₹100", () => {
            // Setup: User 2 has a buy order (bid) on the book
            const buyOrder: Order = {
                price: "100",
                quantity: "10",
                orderId: "buy-1",
                filled: "0",
                side: "buy",
                userId: "2"
            };

            // User 2 locks their INR
            checkAndLockFunds(balances, "TATA", "INR", "buy", "2", "100", "10");
            
            expect(balances.get("2")!.INR.available).toBe("9000");  // 10000 - 1000
            expect(balances.get("2")!.INR.locked).toBe("1000");

            // Add buy order to book
            orderbook.bids.push(buyOrder);

            // User 1 places a sell order
            const sellPrice = "100";
            const sellQty = "10";
            
            // Lock funds for sell order
            const canSell = checkAndLockFunds(balances, "TATA", "INR", "sell", "1", sellPrice, sellQty);
            expect(canSell).toBe(true);
            
            expect(balances.get("1")!.TATA.available).toBe("90");   // 100 - 10
            expect(balances.get("1")!.TATA.locked).toBe("10");

            // Simulate the match
            const sellOrder: Order = {
                price: sellPrice,
                quantity: sellQty,
                orderId: "sell-1",
                filled: "0",
                side: "sell",
                userId: "1"
            };

            const result = orderbook.addOrder(sellOrder);
            
            expect(result.executedQty).toBe("10");
            expect(result.fills.length).toBe(1);

            // Update balances based on fills
            const fills = result.fills.map(f => ({
                qty: f.qty,
                price: f.price,
                otherUserId: f.otherUserId
            }));
            
            updateBalance(balances, "1", "TATA", "INR", "sell", fills);

            // Verify User 1 (Seller) balances
            expect(balances.get("1")!.INR.available).toBe("11000"); // 10000 + 1000 = 11000
            expect(balances.get("1")!.INR.locked).toBe("0");        // Unchanged
            expect(balances.get("1")!.TATA.available).toBe("90");   // Unchanged
            expect(balances.get("1")!.TATA.locked).toBe("0");       // 10 - 10 = 0

            // Verify User 2 (Buyer) balances
            expect(balances.get("2")!.INR.available).toBe("9000");  // Unchanged
            expect(balances.get("2")!.INR.locked).toBe("0");        // 1000 - 1000 = 0
            expect(balances.get("2")!.TATA.available).toBe("110");  // 100 + 10 = 110
            expect(balances.get("2")!.TATA.locked).toBe("0");       // Unchanged

            console.log("\n=== SELL Order Full Fill ===");
            console.log("User 1 (Seller):", balances.get("1"));
            console.log("User 2 (Buyer):", balances.get("2"));
        });
    });

    describe("Partial Fill", () => {
        it("correctly updates balances on partial fill", () => {
            // User 2 places a sell order for 20 shares
            const sellOrder: Order = {
                price: "100",
                quantity: "20",
                orderId: "sell-1",
                filled: "0",
                side: "sell",
                userId: "2"
            };

            checkAndLockFunds(balances, "TATA", "INR", "sell", "2", "100", "20");
            orderbook.asks.push(sellOrder);

            // User 1 places a buy order for only 10 shares
            const buyPrice = "100";
            const buyQty = "10";
            
            checkAndLockFunds(balances, "TATA", "INR", "buy", "1", buyPrice, buyQty);

            const buyOrder: Order = {
                price: buyPrice,
                quantity: buyQty,
                orderId: "buy-1",
                filled: "0",
                side: "buy",
                userId: "1"
            };

            const result = orderbook.addOrder(buyOrder);
            
            expect(result.executedQty).toBe("10");  // Only 10 filled
            expect(result.status).toBe("ACCEPTED");  // Fully filled for taker

            // Update balances
            const fills = result.fills.map(f => ({
                qty: f.qty,
                price: f.price,
                otherUserId: f.otherUserId
            }));
            
            updateBalance(balances, "1", "TATA", "INR", "buy", fills);

            // User 1 (Buyer) - fully satisfied
            expect(balances.get("1")!.INR.locked).toBe("0");
            expect(balances.get("1")!.TATA.available).toBe("110");

            // User 2 (Seller) - partial fill, still has locked shares
            expect(balances.get("2")!.INR.available).toBe("11000");  // Received 1000
            expect(balances.get("2")!.TATA.locked).toBe("10");       // 20 - 10 = 10 still locked

            // Check orderbook - sell order should still be there with 10 remaining
            expect(orderbook.asks.length).toBe(1);
            expect(orderbook.asks[0].filled).toBe("10");

            console.log("\n=== Partial Fill ===");
            console.log("User 1 (Buyer):", balances.get("1"));
            console.log("User 2 (Seller):", balances.get("2"));
            console.log("Remaining ask:", orderbook.asks[0]);
        });
    });

    describe("Multiple Fills", () => {
        it("correctly aggregates multiple fills", () => {
            // User 2 places sell order for 5 shares at 100
            const sellOrder1: Order = {
                price: "100",
                quantity: "5",
                orderId: "sell-1",
                filled: "0",
                side: "sell",
                userId: "2"
            };
            checkAndLockFunds(balances, "TATA", "INR", "sell", "2", "100", "5");
            orderbook.asks.push(sellOrder1);

            // Setup User 3
            balances.set("3", {
                INR: { available: "10000", locked: "0" },
                TATA: { available: "100", locked: "0" }
            });

            // User 3 places sell order for 5 shares at 100
            const sellOrder2: Order = {
                price: "100",
                quantity: "5",
                orderId: "sell-2",
                filled: "0",
                side: "sell",
                userId: "3"
            };
            checkAndLockFunds(balances, "TATA", "INR", "sell", "3", "100", "5");
            orderbook.asks.push(sellOrder2);

            // User 1 buys 10 shares - should match both orders
            checkAndLockFunds(balances, "TATA", "INR", "buy", "1", "100", "10");

            const buyOrder: Order = {
                price: "100",
                quantity: "10",
                orderId: "buy-1",
                filled: "0",
                side: "buy",
                userId: "1"
            };

            const result = orderbook.addOrder(buyOrder);
            
            expect(result.executedQty).toBe("10");
            expect(result.fills.length).toBe(2);  // Two separate fills

            // Update balances
            const fills = result.fills.map(f => ({
                qty: f.qty,
                price: f.price,
                otherUserId: f.otherUserId
            }));
            
            updateBalance(balances, "1", "TATA", "INR", "buy", fills);

            // User 1 (Buyer)
            expect(balances.get("1")!.INR.locked).toBe("0");
            expect(balances.get("1")!.TATA.available).toBe("110");  // +10

            // User 2 (Seller 1)
            expect(balances.get("2")!.INR.available).toBe("10500");  // +500
            expect(balances.get("2")!.TATA.locked).toBe("0");

            // User 3 (Seller 2)
            expect(balances.get("3")!.INR.available).toBe("10500");  // +500
            expect(balances.get("3")!.TATA.locked).toBe("0");

            console.log("\n=== Multiple Fills ===");
            console.log("User 1 (Buyer):", balances.get("1"));
            console.log("User 2 (Seller 1):", balances.get("2"));
            console.log("User 3 (Seller 2):", balances.get("3"));
        });
    });

    describe("Insufficient Funds", () => {
        it("rejects buy order if insufficient INR", () => {
            // User 1 tries to buy 200 shares at 100 = 20000 INR, but only has 10000
            const canBuy = checkAndLockFunds(balances, "TATA", "INR", "buy", "1", "100", "200");
            expect(canBuy).toBe(false);
            
            // Balance unchanged
            expect(balances.get("1")!.INR.available).toBe("10000");
            expect(balances.get("1")!.INR.locked).toBe("0");
        });

        it("rejects sell order if insufficient shares", () => {
            // User 1 tries to sell 200 shares, but only has 100
            const canSell = checkAndLockFunds(balances, "TATA", "INR", "sell", "1", "100", "200");
            expect(canSell).toBe(false);
            
            // Balance unchanged
            expect(balances.get("1")!.TATA.available).toBe("100");
            expect(balances.get("1")!.TATA.locked).toBe("0");
        });
    });

    describe("Conservation of Assets", () => {
        it("total assets are conserved after trade", () => {
            // Initial totals
            const initialTotalINR = 
                parseFloat(balances.get("1")!.INR.available) +
                parseFloat(balances.get("2")!.INR.available);
            const initialTotalTATA = 
                parseFloat(balances.get("1")!.TATA.available) +
                parseFloat(balances.get("2")!.TATA.available);

            // User 2 sells, User 1 buys
            const sellOrder: Order = {
                price: "100",
                quantity: "10",
                orderId: "sell-1",
                filled: "0",
                side: "sell",
                userId: "2"
            };
            checkAndLockFunds(balances, "TATA", "INR", "sell", "2", "100", "10");
            orderbook.asks.push(sellOrder);

            checkAndLockFunds(balances, "TATA", "INR", "buy", "1", "100", "10");
            const buyOrder: Order = {
                price: "100",
                quantity: "10",
                orderId: "buy-1",
                filled: "0",
                side: "buy",
                userId: "1"
            };

            const result = orderbook.addOrder(buyOrder);
            const fills = result.fills.map(f => ({
                qty: f.qty,
                price: f.price,
                otherUserId: f.otherUserId
            }));
            updateBalance(balances, "1", "TATA", "INR", "buy", fills);

            // Final totals
            const finalTotalINR = 
                parseFloat(balances.get("1")!.INR.available) +
                parseFloat(balances.get("1")!.INR.locked) +
                parseFloat(balances.get("2")!.INR.available) +
                parseFloat(balances.get("2")!.INR.locked);
            const finalTotalTATA = 
                parseFloat(balances.get("1")!.TATA.available) +
                parseFloat(balances.get("1")!.TATA.locked) +
                parseFloat(balances.get("2")!.TATA.available) +
                parseFloat(balances.get("2")!.TATA.locked);

            // Assets should be conserved (no money/shares created or destroyed)
            expect(finalTotalINR).toBe(initialTotalINR);
            expect(finalTotalTATA).toBe(initialTotalTATA);

            console.log("\n=== Conservation Check ===");
            console.log(`Total INR: ${initialTotalINR} -> ${finalTotalINR}`);
            console.log(`Total TATA: ${initialTotalTATA} -> ${finalTotalTATA}`);
        });
    });
});
