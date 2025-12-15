import { BASE_CURRENCY } from "./Engine";
import { 
    add, subtract, multiply, min, 
    isGreaterOrEqual, isLessOrEqual, isGreater, isLess, isZero, isEqual 
} from "../utils/decimal";

/**
 * Order interface using STRINGS for price/quantity to preserve precision.
 */
export interface Order {
    price: string;
    quantity: string;
    orderId: string;
    filled: string;
    side: "buy" | "sell";
    userId: string;
}

export interface Fill {
    price: string;
    qty: string;
    tradeId: number;
    otherUserId: string;
    markerOrderId: string;
}

export type SelfTradePreventionMode = "CANCEL_NEWEST" | "CANCEL_OLDEST" | "CANCEL_BOTH";

export interface AddOrderResult {
    status: "ACCEPTED" | "REJECTED" | "PARTIALLY_FILLED";
    executedQty: string;
    fills: Fill[];
    rejectionReason?: string;
    cancelledOrders?: string[];
}

export class Orderbook {
    bids: Order[]; // Sorted: Price High -> Low (Best Bid at index 0)
    asks: Order[]; // Sorted: Price Low -> High (Best Ask at index 0)
    baseAsset: string;
    quoteAsset: string = BASE_CURRENCY;
    lastTradeId: number;
    currentPrice: string;
    stpMode: SelfTradePreventionMode;

    // Cached depth maps
    private bidsDepth: Map<string, string> = new Map();
    private asksDepth: Map<string, string> = new Map();

    constructor(
        baseAsset: string, 
        bids: Order[], 
        asks: Order[], 
        lastTradeId: number, 
        currentPrice: number | string,
        stpMode: SelfTradePreventionMode = "CANCEL_NEWEST"
    ) {
        this.baseAsset = baseAsset;
        this.bids = bids;
        this.asks = asks;
        this.lastTradeId = lastTradeId || 0;
        this.currentPrice = currentPrice?.toString() || "0";
        this.stpMode = stpMode;

        // Ensure orders are sorted on startup (just in case snapshot was out of order)
        this.sortOrders();
        this.rebuildDepthCache();
    }

    /**
     * Critical for Price-Time Priority.
     * Bids: Descending (Highest price first)
     * Asks: Ascending (Lowest price first)
     */
    private sortOrders() {
        this.bids.sort((a, b) => isGreater(a.price, b.price) ? -1 : isLess(a.price, b.price) ? 1 : 0);
        this.asks.sort((a, b) => isLess(a.price, b.price) ? -1 : isGreater(a.price, b.price) ? 1 : 0);
    }

    private rebuildDepthCache(): void {
        this.bidsDepth.clear();
        this.asksDepth.clear();

        for (const order of this.bids) {
            const remaining = subtract(order.quantity, order.filled);
            const current = this.bidsDepth.get(order.price) || "0";
            this.bidsDepth.set(order.price, add(current, remaining));
        }

        for (const order of this.asks) {
            const remaining = subtract(order.quantity, order.filled);
            const current = this.asksDepth.get(order.price) || "0";
            this.asksDepth.set(order.price, add(current, remaining));
        }
    }

    private updateDepth(side: "buy" | "sell", price: string, delta: string): void {
        const depthMap = side === "buy" ? this.bidsDepth : this.asksDepth;
        const current = depthMap.get(price) || "0";
        const newValue = add(current, delta);
        
        if (isLessOrEqual(newValue, "0")) {
            depthMap.delete(price);
        } else {
            depthMap.set(price, newValue);
        }
    }

    ticker() {
        return `${this.baseAsset}_${this.quoteAsset}`;
    }

    getSnapshot() {
        return {
            baseAsset: this.baseAsset,
            bids: this.bids,
            asks: this.asks,
            lastTradeId: this.lastTradeId,
            currentPrice: this.currentPrice
        }
    }

    /**
     * Binary Search to find the correct insertion index.
     * O(log n) search time.
     * 
     * Bids: Descending order (100, 99, 98) - higher price = lower index
     * Asks: Ascending order (98, 99, 100) - lower price = lower index
     */
    private findInsertIndex(arr: Order[], price: string, side: "buy" | "sell"): number {
        let low = 0, high = arr.length;
        
        while (low < high) {
            const mid = (low + high) >>> 1;
            
            // For Bids (Desc): if new price > mid price, insert left (lower index)
            // For Asks (Asc): if new price < mid price, insert left (lower index)
            const shouldGoLeft = side === "buy"
                ? isGreater(price, arr[mid].price)
                : isLess(price, arr[mid].price);

            if (shouldGoLeft) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }
        return low;
    }

    /**
     * PRE-MATCH Check: Would this order self-trade?
     * We simulate the matching logic without executing it.
     * Since book is sorted, we can break early when prices stop matching.
     */
    private wouldSelfTrade(order: Order): { wouldSelfTrade: boolean; conflictingOrders: Order[] } {
        const conflictingOrders: Order[] = [];
        const oppositeBook = order.side === "buy" ? this.asks : this.bids;
        
        // Iterate only through orders that WOULD match
        for (const restingOrder of oppositeBook) {
            const isMatchable = order.side === "buy" 
                ? isLessOrEqual(restingOrder.price, order.price)      // Buy: Ask price <= Order price
                : isGreaterOrEqual(restingOrder.price, order.price);  // Sell: Bid price >= Order price

            if (!isMatchable) break; // Since book is sorted, no further orders can match

            if (restingOrder.userId === order.userId) {
                conflictingOrders.push(restingOrder);
            }
        }
        
        return { wouldSelfTrade: conflictingOrders.length > 0, conflictingOrders };
    }

    addOrder(order: Order): AddOrderResult {
        // 1. STP Check
        const { wouldSelfTrade, conflictingOrders } = this.wouldSelfTrade(order);
        
        if (wouldSelfTrade) {
            if (this.stpMode === "CANCEL_NEWEST") {
                return {
                    status: "REJECTED",
                    executedQty: "0",
                    fills: [],
                    rejectionReason: "STP: Cancel Newest"
                };
            }
            
            // For Cancel Oldest/Both, we must remove resting orders
            for (const conflict of conflictingOrders) {
                if (conflict.side === "buy") this.cancelBid(conflict);
                else this.cancelAsk(conflict);
            }

            if (this.stpMode === "CANCEL_BOTH") {
                return {
                    status: "REJECTED",
                    executedQty: "0",
                    fills: [],
                    rejectionReason: "STP: Cancel Both",
                    cancelledOrders: conflictingOrders.map(o => o.orderId)
                };
            }
        }

        // 2. Try to Match (Taker)
        let result: { fills: Fill[], executedQty: string };
        
        if (order.side === "buy") {
            result = this.matchOrder(order, this.asks, "buy");
        } else {
            result = this.matchOrder(order, this.bids, "sell");
        }

        // 3. Update Order State
        order.filled = result.executedQty;
        
        // 4. If not fully filled, add remainder to book (Maker)
        if (isLess(order.filled, order.quantity)) {
            const remaining = subtract(order.quantity, order.filled);
            
            if (order.side === "buy") {
                const index = this.findInsertIndex(this.bids, order.price, "buy");
                this.bids.splice(index, 0, order);
                this.updateDepth("buy", order.price, remaining);
            } else {
                const index = this.findInsertIndex(this.asks, order.price, "sell");
                this.asks.splice(index, 0, order);
                this.updateDepth("sell", order.price, remaining);
            }

            return {
                status: isGreater(result.executedQty, "0") ? "PARTIALLY_FILLED" : "ACCEPTED",
                executedQty: result.executedQty,
                fills: result.fills
            };
        }

        return {
            status: "ACCEPTED",
            executedQty: result.executedQty,
            fills: result.fills
        };
    }

    /**
     * Generic Matching Engine
     * Iterates through the book (sorted best to worst)
     * 
     * @param incomingOrder - The taker order
     * @param book - The opposite side's order book (asks for buy, bids for sell)
     * @param side - The side of the incoming order
     */
    private matchOrder(
        incomingOrder: Order, 
        book: Order[], 
        side: "buy" | "sell"
    ): { fills: Fill[], executedQty: string } {
        const fills: Fill[] = [];
        let executedQty = "0";
        let qtyToFill = incomingOrder.quantity;

        // Iterate through the book until filled or prices don't match
        // NOTE: We do NOT increment 'i' if we remove an order (splice), 
        // because the next order slides into index 0.
        let i = 0;
        while (i < book.length && isGreater(qtyToFill, "0")) {
            const makerOrder = book[i];

            // Check Price Crossing
            const pricesCross = side === "buy"
                ? isLessOrEqual(makerOrder.price, incomingOrder.price)     // Buy: Ask <= Bid
                : isGreaterOrEqual(makerOrder.price, incomingOrder.price); // Sell: Bid >= Ask

            if (!pricesCross) break; // Stop matching if best price is too expensive/cheap

            // STP Check (skip own orders that somehow weren't caught earlier)
            if (makerOrder.userId === incomingOrder.userId) {
                i++;
                continue;
            }

            // Calculate Fill
            const remainingMaker = subtract(makerOrder.quantity, makerOrder.filled);
            const fillQty = min(qtyToFill, remainingMaker);

            // Execute Trade
            executedQty = add(executedQty, fillQty);
            qtyToFill = subtract(qtyToFill, fillQty);
            
            makerOrder.filled = add(makerOrder.filled, fillQty);
            
            // Update Depth (negative delta)
            const makerSide = side === "buy" ? "sell" : "buy";
            this.updateDepth(makerSide, makerOrder.price, subtract("0", fillQty));

            fills.push({
                price: makerOrder.price,
                qty: fillQty,
                tradeId: this.lastTradeId++,
                otherUserId: makerOrder.userId,
                markerOrderId: makerOrder.orderId
            });

            this.currentPrice = makerOrder.price;

            // If maker order fully filled, remove it
            if (isEqual(makerOrder.filled, makerOrder.quantity)) {
                book.splice(i, 1); // Remove from book
                // Don't increment i, because next element is now at index i
            } else {
                i++; // Move to next order
            }
        }

        return { fills, executedQty };
    }

    getOpenOrders(userId: string): Order[] {
        const asks = this.asks.filter(x => x.userId === userId);
        const bids = this.bids.filter(x => x.userId === userId);
        return [...asks, ...bids];
    }

    cancelBid(order: Order): string | undefined {
        const index = this.bids.findIndex(x => x.orderId === order.orderId);
        if (index !== -1) {
            const cancelledOrder = this.bids[index];
            const price = cancelledOrder.price;
            const remaining = subtract(cancelledOrder.quantity, cancelledOrder.filled);
            this.updateDepth("buy", price, subtract("0", remaining));
            this.bids.splice(index, 1);
            return price;
        }
        return undefined;
    }

    cancelAsk(order: Order): string | undefined {
        const index = this.asks.findIndex(x => x.orderId === order.orderId);
        if (index !== -1) {
            const cancelledOrder = this.asks[index];
            const price = cancelledOrder.price;
            const remaining = subtract(cancelledOrder.quantity, cancelledOrder.filled);
            this.updateDepth("sell", price, subtract("0", remaining));
            this.asks.splice(index, 1);
            return price;
        }
        return undefined;
    }
    
    getDepthAtPrice(side: "buy" | "sell", price: string): string {
        const depthMap = side === "buy" ? this.bidsDepth : this.asksDepth;
        return depthMap.get(price) || "0";
    }

    getDepth(): { bids: [string, string][], asks: [string, string][] } {
        const bids: [string, string][] = [];
        const asks: [string, string][] = [];

        for (const [price, qty] of this.bidsDepth.entries()) {
            if (isGreater(qty, "0")) bids.push([price, qty]);
        }
        for (const [price, qty] of this.asksDepth.entries()) {
            if (isGreater(qty, "0")) asks.push([price, qty]);
        }

        // Sort for API response
        bids.sort((a, b) => isGreater(a[0], b[0]) ? -1 : 1);
        asks.sort((a, b) => isLess(a[0], b[0]) ? -1 : 1);

        return { bids, asks };
    }
}
