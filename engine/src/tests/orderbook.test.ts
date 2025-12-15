import { describe, expect, it, beforeEach } from "vitest";
import { Orderbook, Order } from "../trade/Orderbook";
import { subtract } from "../utils/decimal";

describe("Orderbook - Basic Operations", () => {
    let orderbook: Orderbook;

    beforeEach(() => {
        orderbook = new Orderbook("TATA", [], [], 0, "0");
    });

    it("Empty orderbook should not fill orders", () => {
        const order: Order = {
            price: "1000",
            quantity: "1",
            orderId: "1",
            filled: "0",
            side: "buy",
            userId: "1",
        };
        const { fills, executedQty } = orderbook.addOrder(order);
        expect(fills.length).toBe(0);
        expect(executedQty).toBe("0");
        expect(orderbook.bids.length).toBe(1);
    });

    it("Buy order should be added to bids when no matching asks", () => {
        const order: Order = {
            price: "1000",
            quantity: "5",
            orderId: "1",
            filled: "0",
            side: "buy",
            userId: "1",
        };
        orderbook.addOrder(order);
        expect(orderbook.bids.length).toBe(1);
        expect(orderbook.asks.length).toBe(0);
    });

    it("Sell order should be added to asks when no matching bids", () => {
        const order: Order = {
            price: "1000",
            quantity: "5",
            orderId: "1",
            filled: "0",
            side: "sell",
            userId: "1",
        };
        orderbook.addOrder(order);
        expect(orderbook.asks.length).toBe(1);
        expect(orderbook.bids.length).toBe(0);
    });
});

describe("Orderbook - Order Matching", () => {
    it("Should fully match when quantities are equal", () => {
        const orderbook = new Orderbook(
            "TATA",
            [{
                price: "1000",
                quantity: "5",
                orderId: "1",
                filled: "0",
                side: "buy",
                userId: "1",
            }],
            [],
            0,
            "0"
        );

        const sellOrder: Order = {
            price: "1000",
            quantity: "5",
            orderId: "2",
            filled: "0",
            side: "sell",
            userId: "2",
        };

        const { fills, executedQty } = orderbook.addOrder(sellOrder);
        expect(fills.length).toBe(1);
        expect(executedQty).toBe("5");
        expect(fills[0].qty).toBe("5");
        expect(orderbook.bids.length).toBe(0);
        expect(orderbook.asks.length).toBe(0);
    });

    it("Should partially fill when sell quantity exceeds buy", () => {
        const orderbook = new Orderbook(
            "TATA",
            [{
                price: "1000",
                quantity: "3",
                orderId: "1",
                filled: "0",
                side: "buy",
                userId: "1",
            }],
            [],
            0,
            "0"
        );

        const sellOrder: Order = {
            price: "1000",
            quantity: "5",
            orderId: "2",
            filled: "0",
            side: "sell",
            userId: "2",
        };

        const { fills, executedQty } = orderbook.addOrder(sellOrder);
        expect(fills.length).toBe(1);
        expect(executedQty).toBe("3");
        expect(orderbook.bids.length).toBe(0);
        expect(orderbook.asks.length).toBe(1);
        // Remaining in asks = 5 - 3 = 2
        expect(subtract(orderbook.asks[0].quantity, orderbook.asks[0].filled)).toBe("2");
    });

    it("Can be partially filled with existing bid and ask", () => {
        const orderbook = new Orderbook("TATA", [{
            price: "999",
            quantity: "1",
            orderId: "1",
            filled: "0",
            side: "buy" as ("buy" | "sell"),
            userId: "1"
        }],
        [{
            price: "1001",
            quantity: "1",
            orderId: "2",
            filled: "0",
            side: "sell" as ("buy" | "sell"),
            userId: "2"
        }], 0, "0");

        const order: Order = {
            price: "1001",
            quantity: "2",
            orderId: "3",
            filled: "0",
            side: "buy",
            userId: "3"
        };

        const { fills, executedQty } = orderbook.addOrder(order);
        expect(fills.length).toBe(1);
        expect(executedQty).toBe("1");
        expect(orderbook.bids.length).toBe(2);
        expect(orderbook.asks.length).toBe(0);
    });

    it("Should match multiple orders at different price levels", () => {
        const orderbook = new Orderbook(
            "TATA",
            [
                { price: "1002", quantity: "2", orderId: "1", filled: "0", side: "buy" as const, userId: "1" },
                { price: "1001", quantity: "3", orderId: "2", filled: "0", side: "buy" as const, userId: "2" },
                { price: "1000", quantity: "5", orderId: "3", filled: "0", side: "buy" as const, userId: "3" },
            ],
            [],
            0,
            "0"
        );

        const sellOrder: Order = {
            price: "1000",
            quantity: "6",
            orderId: "4",
            filled: "0",
            side: "sell",
            userId: "4",
        };

        const { fills, executedQty } = orderbook.addOrder(sellOrder);
        expect(fills.length).toBe(3); // Matches all 3 bids partially
        expect(executedQty).toBe("6");
    });

    it("Buy order should not match asks above bid price", () => {
        const orderbook = new Orderbook(
            "TATA",
            [],
            [{
                price: "1010",
                quantity: "5",
                orderId: "1",
                filled: "0",
                side: "sell",
                userId: "1",
            }],
            0,
            "0"
        );

        const buyOrder: Order = {
            price: "1005",
            quantity: "5",
            orderId: "2",
            filled: "0",
            side: "buy",
            userId: "2",
        };

        const { fills, executedQty } = orderbook.addOrder(buyOrder);
        expect(fills.length).toBe(0);
        expect(executedQty).toBe("0");
        expect(orderbook.bids.length).toBe(1);
        expect(orderbook.asks.length).toBe(1);
    });

    it("Sell order should not match bids below ask price", () => {
        const orderbook = new Orderbook(
            "TATA",
            [{
                price: "990",
                quantity: "5",
                orderId: "1",
                filled: "0",
                side: "buy",
                userId: "1",
            }],
            [],
            0,
            "0"
        );

        const sellOrder: Order = {
            price: "1000",
            quantity: "5",
            orderId: "2",
            filled: "0",
            side: "sell",
            userId: "2",
        };

        const { fills, executedQty } = orderbook.addOrder(sellOrder);
        expect(fills.length).toBe(0);
        expect(executedQty).toBe("0");
        expect(orderbook.bids.length).toBe(1);
        expect(orderbook.asks.length).toBe(1);
    });
});

describe("Orderbook - getDepth", () => {
    it("Should aggregate orders at same price level", () => {
        const orderbook = new Orderbook(
            "TATA",
            [
                { price: "1000", quantity: "5", orderId: "1", filled: "0", side: "buy" as const, userId: "1" },
                { price: "1000", quantity: "3", orderId: "2", filled: "0", side: "buy" as const, userId: "2" },
                { price: "999", quantity: "10", orderId: "3", filled: "0", side: "buy" as const, userId: "3" },
            ],
            [
                { price: "1001", quantity: "4", orderId: "4", filled: "0", side: "sell" as const, userId: "4" },
                { price: "1001", quantity: "6", orderId: "5", filled: "0", side: "sell" as const, userId: "5" },
            ],
            0,
            "0"
        );

        const depth = orderbook.getDepth();
        
        // Bids: 1000 -> 8 (5+3), 999 -> 10
        expect(depth.bids.length).toBe(2);
        const bid1000 = depth.bids.find(b => b[0] === "1000");
        expect(bid1000?.[1]).toBe("8");
        
        // Asks: 1001 -> 10 (4+6)
        expect(depth.asks.length).toBe(1);
        expect(depth.asks[0][1]).toBe("10");
    });

    it("Should return empty arrays for empty orderbook", () => {
        const orderbook = new Orderbook("TATA", [], [], 0, "0");
        const depth = orderbook.getDepth();
        expect(depth.bids.length).toBe(0);
        expect(depth.asks.length).toBe(0);
    });
});

describe("Orderbook - Cancel Orders", () => {
    it("Should cancel bid order", () => {
        const orderbook = new Orderbook(
            "TATA",
            [{
                price: "1000",
                quantity: "5",
                orderId: "1",
                filled: "0",
                side: "buy",
                userId: "1",
            }],
            [],
            0,
            "0"
        );

        const order = orderbook.bids[0];
        const price = orderbook.cancelBid(order);
        
        expect(price).toBe("1000");
        expect(orderbook.bids.length).toBe(0);
    });

    it("Should cancel ask order", () => {
        const orderbook = new Orderbook(
            "TATA",
            [],
            [{
                price: "1000",
                quantity: "5",
                orderId: "1",
                filled: "0",
                side: "sell",
                userId: "1",
            }],
            0,
            "0"
        );

        const order = orderbook.asks[0];
        const price = orderbook.cancelAsk(order);
        
        expect(price).toBe("1000");
        expect(orderbook.asks.length).toBe(0);
    });

    it("Should return undefined when cancelling non-existent order", () => {
        const orderbook = new Orderbook("TATA", [], [], 0, "0");
        const fakeOrder: Order = {
            price: "1000",
            quantity: "5",
            orderId: "non-existent",
            filled: "0",
            side: "buy",
            userId: "1",
        };
        const result = orderbook.cancelBid(fakeOrder);
        expect(result).toBeUndefined();
    });
});

describe("Orderbook - Get Open Orders", () => {
    it("Should return all orders for a user", () => {
        const orderbook = new Orderbook(
            "TATA",
            [
                { price: "1000", quantity: "5", orderId: "1", filled: "0", side: "buy" as const, userId: "user1" },
                { price: "999", quantity: "3", orderId: "2", filled: "0", side: "buy" as const, userId: "user2" },
            ],
            [
                { price: "1001", quantity: "4", orderId: "3", filled: "0", side: "sell" as const, userId: "user1" },
            ],
            0,
            "0"
        );

        const user1Orders = orderbook.getOpenOrders("user1");
        expect(user1Orders.length).toBe(2);
        
        const user2Orders = orderbook.getOpenOrders("user2");
        expect(user2Orders.length).toBe(1);
        
        const user3Orders = orderbook.getOpenOrders("user3");
        expect(user3Orders.length).toBe(0);
    });
});

describe("Self Trade Prevention", () => {
    it("User cannot trade with themselves - CANCEL_NEWEST rejects incoming order", () => {
        const orderbook = new Orderbook(
            "TATA",
            [],
            [{
                price: "1000",
                quantity: "5",
                orderId: "1",
                filled: "0",
                side: "sell",
                userId: "1", // Same user has a sell order
            }],
            0,
            "0"
        );

        const buyOrder: Order = {
            price: "1000",
            quantity: "5",
            orderId: "2",
            filled: "0",
            side: "buy",
            userId: "1", // Same user trying to buy
        };

        const result = orderbook.addOrder(buyOrder);
        
        // With CANCEL_NEWEST mode, incoming order is REJECTED entirely
        expect(result.status).toBe("REJECTED");
        expect(result.fills.length).toBe(0);
        expect(result.executedQty).toBe("0");
        expect(result.rejectionReason).toContain("STP");
        // Incoming order NOT added to book
        expect(orderbook.bids.length).toBe(0);
        // Original order remains
        expect(orderbook.asks.length).toBe(1);
    });

    it("User cannot trade with themselves - sell matching own buy rejected", () => {
        const orderbook = new Orderbook(
            "TATA",
            [{
                price: "1000",
                quantity: "5",
                orderId: "1",
                filled: "0",
                side: "buy",
                userId: "1", // Same user has a buy order
            }],
            [],
            0,
            "0"
        );

        const sellOrder: Order = {
            price: "1000",
            quantity: "5",
            orderId: "2",
            filled: "0",
            side: "sell",
            userId: "1", // Same user trying to sell
        };

        const result = orderbook.addOrder(sellOrder);
        
        // With CANCEL_NEWEST mode, incoming order is REJECTED entirely
        expect(result.status).toBe("REJECTED");
        expect(result.fills.length).toBe(0);
        expect(result.executedQty).toBe("0");
        // Incoming order NOT added to book
        expect(orderbook.asks.length).toBe(0);
        // Original order remains
        expect(orderbook.bids.length).toBe(1);
    });

    it("Orders at non-matching prices should not trigger STP", () => {
        // User1 has a sell at 1010 (high price)
        // User1 places a buy at 1000 (lower price) - won't match, so no STP
        const orderbook = new Orderbook(
            "TATA",
            [],
            [{
                price: "1010",
                quantity: "5",
                orderId: "1",
                filled: "0",
                side: "sell",
                userId: "1",
            }],
            0,
            "0"
        );

        const buyOrder: Order = {
            price: "1000",  // Below ask price, won't match
            quantity: "5",
            orderId: "2",
            filled: "0",
            side: "buy",
            userId: "1",
        };

        const result = orderbook.addOrder(buyOrder);
        
        // No matching prices, so no STP triggered
        expect(result.status).toBe("ACCEPTED");
        expect(result.fills.length).toBe(0);
        expect(orderbook.bids.length).toBe(1);  // Buy order added
        expect(orderbook.asks.length).toBe(1);  // Sell order remains
    });
});

describe("Precision Handling", () => {
    it("Should handle decimal quantities correctly", () => {
        const orderbook = new Orderbook(
            "TATA",
            [{
                price: "999.99",
                quantity: "0.551123",
                orderId: "1",
                filled: "0",
                side: "buy",
                userId: "1",
            }],
            [],
            0,
            "0"
        );

        const sellOrder: Order = {
            price: "999.99",
            quantity: "0.551123",
            orderId: "2",
            filled: "0",
            side: "sell",
            userId: "2",
        };

        const { fills, executedQty } = orderbook.addOrder(sellOrder);
        expect(fills.length).toBe(1);
        expect(orderbook.bids.length).toBe(0);
        expect(orderbook.asks.length).toBe(0);
    });

    it("Should handle small decimal prices", () => {
        const orderbook = new Orderbook(
            "TATA",
            [{
                price: "0.00001",
                quantity: "1000000",
                orderId: "1",
                filled: "0",
                side: "buy",
                userId: "1",
            }],
            [],
            0,
            "0"
        );

        const sellOrder: Order = {
            price: "0.00001",
            quantity: "500000",
            orderId: "2",
            filled: "0",
            side: "sell",
            userId: "2",
        };

        const { fills, executedQty } = orderbook.addOrder(sellOrder);
        expect(fills.length).toBe(1);
        expect(executedQty).toBe("500000");
    });
});

describe("Orderbook - Ticker", () => {
    it("Should return correct ticker format", () => {
        const orderbook = new Orderbook("TATA", [], [], 0, "0");
        expect(orderbook.ticker()).toBe("TATA_INR");
    });

    it("Should return correct snapshot", () => {
        const orderbook = new Orderbook(
            "BTC",
            [{ price: "50000", quantity: "1", orderId: "1", filled: "0", side: "buy" as const, userId: "1" }],
            [{ price: "51000", quantity: "1", orderId: "2", filled: "0", side: "sell" as const, userId: "2" }],
            10,
            "50500"
        );

        const snapshot = orderbook.getSnapshot();
        expect(snapshot.baseAsset).toBe("BTC");
        expect(snapshot.bids.length).toBe(1);
        expect(snapshot.asks.length).toBe(1);
        expect(snapshot.lastTradeId).toBe(10);
        expect(snapshot.currentPrice).toBe("50500");
    });
});
