import fs from "fs";
import { RedisManager } from "../RedisManager";
import { ORDER_UPDATE, TRADE_ADDED } from "../types/index";
import { CANCEL_ORDER, CREATE_ORDER, GET_BALANCE, GET_DEPTH, GET_OPEN_ORDERS, MessageFromApi, ON_RAMP, WITHDRAW } from "../types/fromApi";
import { AddOrderResult, Fill, Order, Orderbook } from "./Orderbook";
import { add, subtract, multiply, isLess, isGreater, toNumber } from "../utils/decimal";

export const BASE_CURRENCY = "INR";

/**
 * User balance interface using STRINGS for precision.
 * Never use JavaScript numbers for financial calculations!
 */
interface UserBalance {
    [key: string]: {
        available: string;  // String for precision
        locked: string;     // String for precision
    }
}

export class Engine {
    private orderbooks: Orderbook[] = [];
    private balances: Map<string, UserBalance> = new Map();

    constructor() {
        let snapshot = null
        try {
            if (process.env.WITH_SNAPSHOT) {
                snapshot = fs.readFileSync("./snapshot.json");
            }
        } catch (e) {
            console.log("No snapshot found");
        }

        if (snapshot) {
            const snapshotSnapshot = JSON.parse(snapshot.toString());
            this.orderbooks = snapshotSnapshot.orderbooks.map((o: any) => new Orderbook(o.baseAsset, o.bids, o.asks, o.lastTradeId, o.currentPrice));
            this.balances = new Map(snapshotSnapshot.balances);
        } else {
            this.orderbooks = [new Orderbook(`TATA`, [], [], 0, "0")];
            this.setBaseBalances();
        }
        setInterval(() => {
            this.saveSnapshot();
        }, 1000 * 3);
    }

    saveSnapshot() {
        const snapshotSnapshot = {
            orderbooks: this.orderbooks.map(o => o.getSnapshot()),
            balances: Array.from(this.balances.entries())
        }
        fs.writeFileSync("./snapshot.json", JSON.stringify(snapshotSnapshot));
    }

    process({ message, clientId }: {message: MessageFromApi, clientId: string}) {
        switch (message.type) {
            case CREATE_ORDER:
                try {
                    const { executedQty, fills, orderId } = this.createOrder(
                        message.data.market, 
                        message.data.price, 
                        message.data.quantity, 
                        message.data.side, 
                        message.data.userId
                    );
                    RedisManager.getInstance().sendToApi(clientId, {
                        type: "ORDER_PLACED",
                        payload: {
                            orderId,
                            executedQty,
                            fills
                        }
                    });
                } catch (e: any) {
                    const errorMessage = e?.message || "Order failed";
                    console.log("Order rejected:", errorMessage);
                    
                    const isSelfTradeRejection = errorMessage.includes("SELF_TRADE_PREVENTION");
                    
                    RedisManager.getInstance().sendToApi(clientId, {
                        type: "ORDER_REJECTED",
                        payload: {
                            orderId: "",
                            executedQty: "0",
                            remainingQty: "0",
                            reason: errorMessage,
                            code: isSelfTradeRejection ? "SELF_TRADE" : "ORDER_FAILED"
                        }
                    });
                }
                break;
            case CANCEL_ORDER:
                try {
                    const orderId = message.data.orderId;
                    const cancelMarket = message.data.market;
                    const cancelOrderbook = this.orderbooks.find(o => o.ticker() === cancelMarket);
                    const baseAsset = cancelMarket.split("_")[0];
                    const quoteAsset = cancelMarket.split("_")[1];
                    
                    if (!cancelOrderbook) {
                        throw new Error("No orderbook found");
                    }

                    const order = cancelOrderbook.asks.find(o => o.orderId === orderId) || cancelOrderbook.bids.find(o => o.orderId === orderId);
                    if (!order) {
                        console.log("No order found");
                        throw new Error("No order found");
                    }

                    if (order.side === "buy") {
                        const price = cancelOrderbook.cancelBid(order);
                        // leftQuantity = (quantity - filled) * price
                        const leftQuantity = multiply(subtract(order.quantity, order.filled), order.price);
                        
                        const userBalance = this.balances.get(order.userId);
                        if (userBalance && userBalance[quoteAsset]) {
                            userBalance[quoteAsset].available = add(userBalance[quoteAsset].available, leftQuantity);
                            userBalance[quoteAsset].locked = subtract(userBalance[quoteAsset].locked, leftQuantity);
                        }
                        
                        if (price) {
                            this.sendUpdatedDepthAt(price, cancelMarket);
                        }
                    } else {
                        const price = cancelOrderbook.cancelAsk(order);
                        const leftQuantity = subtract(order.quantity, order.filled);
                        
                        const userBalance = this.balances.get(order.userId);
                        if (userBalance && userBalance[baseAsset]) {
                            userBalance[baseAsset].available = add(userBalance[baseAsset].available, leftQuantity);
                            userBalance[baseAsset].locked = subtract(userBalance[baseAsset].locked, leftQuantity);
                        }
                        
                        if (price) {
                            this.sendUpdatedDepthAt(price, cancelMarket);
                        }
                    }

                    RedisManager.getInstance().sendToApi(clientId, {
                        type: "ORDER_CANCELLED",
                        payload: {
                            orderId,
                            executedQty: "0",
                            remainingQty: "0"
                        }
                    });
                    
                } catch (e) {
                    console.log("Error while cancelling order");
                    console.log(e);
                }
                break;
            case GET_OPEN_ORDERS:
                try {
                    const openOrderbook = this.orderbooks.find(o => o.ticker() === message.data.market);
                    if (!openOrderbook) {
                        throw new Error("No orderbook found");
                    }
                    const openOrders = openOrderbook.getOpenOrders(message.data.userId);

                    RedisManager.getInstance().sendToApi(clientId, {
                        type: "OPEN_ORDERS",
                        payload: openOrders
                    }); 
                } catch(e) {
                    console.log(e);
                }
                break;
            case ON_RAMP:
                const userId = message.data.userId;
                const amount = message.data.amount.toString();  // Keep as string
                this.onRamp(userId, amount);
                RedisManager.getInstance().sendToApi(clientId, {
                    type: "ON_RAMP_SUCCESS",
                    payload: {
                        userId,
                        amount,
                        newBalance: this.balances.get(userId)?.[BASE_CURRENCY]?.available || "0"
                    }
                });
                break;
            case WITHDRAW:
                try {
                    const withdrawUserId = message.data.userId;
                    const withdrawAmount = message.data.amount.toString();
                    const result = this.withdraw(withdrawUserId, withdrawAmount);
                    RedisManager.getInstance().sendToApi(clientId, {
                        type: "WITHDRAW_SUCCESS",
                        payload: {
                            userId: withdrawUserId,
                            amount: withdrawAmount,
                            newBalance: result.newBalance,
                            txnId: message.data.txnId
                        }
                    });
                } catch (e: any) {
                    RedisManager.getInstance().sendToApi(clientId, {
                        type: "WITHDRAW_FAILED",
                        payload: {
                            error: e.message
                        }
                    });
                }
                break;
            case GET_DEPTH:
                try {
                    const market = message.data.market;
                    const orderbook = this.orderbooks.find(o => o.ticker() === market);
                    if (!orderbook) {
                        throw new Error("No orderbook found");
                    }
                    RedisManager.getInstance().sendToApi(clientId, {
                        type: "DEPTH",
                        payload: orderbook.getDepth()
                    });
                } catch (e) {
                    console.log(e);
                    RedisManager.getInstance().sendToApi(clientId, {
                        type: "DEPTH",
                        payload: {
                            bids: [],
                            asks: []
                        }
                    });
                }
                break;
            case GET_BALANCE:
                try {
                    const userBalance = this.balances.get(message.data.userId);
                    RedisManager.getInstance().sendToApi(clientId, {
                        type: "BALANCE",
                        payload: userBalance || {}
                    });
                } catch (e) {
                    console.log(e);
                    RedisManager.getInstance().sendToApi(clientId, {
                        type: "BALANCE",
                        payload: {}
                    });
                }
                break;
        }
    }

    addOrderbook(orderbook: Orderbook) {
        this.orderbooks.push(orderbook);
    }

    createOrder(market: string, price: string, quantity: string, side: "buy" | "sell", userId: string) {
        const orderbook = this.orderbooks.find(o => o.ticker() === market);
        const baseAsset = market.split("_")[0];
        const quoteAsset = market.split("_")[1];

        if (!orderbook) {
            throw new Error("No orderbook found");
        }

        this.checkAndLockFunds(baseAsset, quoteAsset, side, userId, price, quantity);

        const order: Order = {
            price: price,           // String
            quantity: quantity,     // String
            orderId: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
            filled: "0",            // String
            side,
            userId
        };
        
        const result: AddOrderResult = orderbook.addOrder(order);
        
        // Handle Self-Trade Prevention rejection
        if (result.status === "REJECTED") {
            this.unlockFunds(baseAsset, quoteAsset, side, userId, price, quantity);
            throw new Error(result.rejectionReason || "Order rejected due to self-trade prevention");
        }
        
        const { fills, executedQty } = result;
        this.updateBalance(userId, baseAsset, quoteAsset, side, fills, executedQty);

        this.createDbTrades(fills, market, userId, side);
        this.updateDbOrders(order, executedQty, fills, market);
        this.publisWsDepthUpdates(fills, price, side, market);
        this.publishWsTrades(fills, userId, market, side);
        this.publishUserTrades(fills, userId, market, side);
        
        return { executedQty, fills, orderId: order.orderId };
    }

    updateDbOrders(order: Order, executedQty: string, fills: Fill[], market: string) {
        RedisManager.getInstance().pushMessage({
            type: ORDER_UPDATE,
            data: {
                orderId: order.orderId,
                executedQty: executedQty,
                market: market,
                price: order.price,
                quantity: order.quantity,
                side: order.side,
            }
        });

        fills.forEach(fill => {
            RedisManager.getInstance().pushMessage({
                type: ORDER_UPDATE,
                data: {
                    orderId: fill.markerOrderId,
                    executedQty: fill.qty
                }
            });
        });
    }

    createDbTrades(fills: Fill[], market: string, userId: string, side: "buy" | "sell") {
        fills.forEach(fill => {
            const isBuyerMaker = side === "sell";
            
            RedisManager.getInstance().pushMessage({
                type: TRADE_ADDED,
                data: {
                    market: market,
                    id: fill.tradeId.toString(),
                    isBuyerMaker: isBuyerMaker,
                    price: fill.price,
                    quantity: fill.qty,
                    quoteQuantity: multiply(fill.qty, fill.price),
                    timestamp: Date.now()
                }
            });
        });
    }

    publishWsTrades(fills: Fill[], userId: string, market: string, side: "buy" | "sell") {
        fills.forEach(fill => {
            const isBuyerMaker = side === "sell";
            
            RedisManager.getInstance().publishMessage(`trade@${market}`, {
                stream: `trade@${market}`,
                data: {
                    e: "trade",
                    t: fill.tradeId,
                    m: isBuyerMaker,
                    p: fill.price,
                    q: fill.qty,
                    s: market,
                }
            });
        });
    }

    publishUserTrades(fills: Fill[], userId: string, market: string, side: "buy" | "sell") {
        fills.forEach(fill => {
            RedisManager.getInstance().publishMessage(`userTrades@${userId}`, {
                stream: `userTrades@${userId}`,
                data: {
                    e: "userTrade",
                    t: fill.tradeId,
                    s: market,
                    p: fill.price,
                    q: fill.qty,
                    side: side,
                    role: "taker",
                    timestamp: Date.now(),
                }
            });

            RedisManager.getInstance().publishMessage(`userTrades@${fill.otherUserId}`, {
                stream: `userTrades@${fill.otherUserId}`,
                data: {
                    e: "userTrade",
                    t: fill.tradeId,
                    s: market,
                    p: fill.price,
                    q: fill.qty,
                    side: side === "buy" ? "sell" : "buy",
                    role: "maker",
                    timestamp: Date.now(),
                }
            });
        });
    }

    sendUpdatedDepthAt(price: string, market: string) {
        const orderbook = this.orderbooks.find(o => o.ticker() === market);
        if (!orderbook) {
            return;
        }
        const depth = orderbook.getDepth();
        const updatedBids = depth?.bids.filter(x => x[0] === price);
        const updatedAsks = depth?.asks.filter(x => x[0] === price);
        
        RedisManager.getInstance().publishMessage(`depth@${market}`, {
            stream: `depth@${market}`,
            data: {
                a: updatedAsks.length ? updatedAsks : [[price, "0"]],
                b: updatedBids.length ? updatedBids : [[price, "0"]],
                e: "depth"
            }
        });
    }

    publisWsDepthUpdates(fills: Fill[], price: string, side: "buy" | "sell", market: string) {
        const orderbook = this.orderbooks.find(o => o.ticker() === market);
        if (!orderbook) {
            return;
        }
        const depth = orderbook.getDepth();
        if (side === "buy") {
            const updatedAsks = depth?.asks.filter(x => fills.map(f => f.price).includes(x[0]));
            const updatedBid = depth?.bids.find(x => x[0] === price);
            console.log("publish ws depth updates");
            RedisManager.getInstance().publishMessage(`depth@${market}`, {
                stream: `depth@${market}`,
                data: {
                    a: updatedAsks,
                    b: updatedBid ? [updatedBid] : [],
                    e: "depth"
                }
            });
        }
        if (side === "sell") {
           const updatedBids = depth?.bids.filter(x => fills.map(f => f.price).includes(x[0]));
           const updatedAsk = depth?.asks.find(x => x[0] === price);
           console.log("publish ws depth updates");
           RedisManager.getInstance().publishMessage(`depth@${market}`, {
               stream: `depth@${market}`,
               data: {
                   a: updatedAsk ? [updatedAsk] : [],
                   b: updatedBids,
                   e: "depth"
               }
           });
        }
    }

    /**
     * Update balances after order fills using decimal precision
     */
    updateBalance(userId: string, baseAsset: string, quoteAsset: string, side: "buy" | "sell", fills: Fill[], executedQty: string) {
        if (side === "buy") {
            fills.forEach(fill => {
                const fillValue = multiply(fill.qty, fill.price);  // qty * price
                
                // Maker (seller) receives quote asset
                const makerBalance = this.balances.get(fill.otherUserId);
                if (makerBalance) {
                    makerBalance[quoteAsset].available = add(makerBalance[quoteAsset].available, fillValue);
                    makerBalance[baseAsset].locked = subtract(makerBalance[baseAsset].locked, fill.qty);
                }
                
                // Taker (buyer) pays quote asset, receives base asset
                const takerBalance = this.balances.get(userId);
                if (takerBalance) {
                    takerBalance[quoteAsset].locked = subtract(takerBalance[quoteAsset].locked, fillValue);
                    takerBalance[baseAsset].available = add(takerBalance[baseAsset].available, fill.qty);
                }
            });
        } else {
            fills.forEach(fill => {
                const fillValue = multiply(fill.qty, fill.price);  // qty * price
                
                // Maker (buyer) pays quote asset, receives base asset
                const makerBalance = this.balances.get(fill.otherUserId);
                if (makerBalance) {
                    makerBalance[quoteAsset].locked = subtract(makerBalance[quoteAsset].locked, fillValue);
                    makerBalance[baseAsset].available = add(makerBalance[baseAsset].available, fill.qty);
                }
                
                // Taker (seller) receives quote asset
                const takerBalance = this.balances.get(userId);
                if (takerBalance) {
                    takerBalance[quoteAsset].available = add(takerBalance[quoteAsset].available, fillValue);
                    takerBalance[baseAsset].locked = subtract(takerBalance[baseAsset].locked, fill.qty);
                }
            });
        }
    }

    /**
     * Check if user has sufficient funds and lock them
     */
    checkAndLockFunds(baseAsset: string, quoteAsset: string, side: "buy" | "sell", userId: string, price: string, quantity: string) {
        const userBalance = this.balances.get(userId);
        if (!userBalance) {
            throw new Error("User not found");
        }

        if (side === "buy") {
            const required = multiply(quantity, price);  // quantity * price
            const available = userBalance[quoteAsset]?.available || "0";
            
            if (isLess(available, required)) {
                throw new Error("Insufficient funds");
            }
            
            userBalance[quoteAsset].available = subtract(available, required);
            userBalance[quoteAsset].locked = add(userBalance[quoteAsset].locked || "0", required);
        } else {
            const available = userBalance[baseAsset]?.available || "0";
            
            if (isLess(available, quantity)) {
                throw new Error("Insufficient funds");
            }
            
            userBalance[baseAsset].available = subtract(available, quantity);
            userBalance[baseAsset].locked = add(userBalance[baseAsset].locked || "0", quantity);
        }
    }

    /**
     * Unlock funds when order is rejected (e.g., due to self-trade prevention)
     */
    unlockFunds(baseAsset: string, quoteAsset: string, side: "buy" | "sell", userId: string, price: string, quantity: string) {
        const userBalance = this.balances.get(userId);
        if (!userBalance) return;

        if (side === "buy") {
            const amount = multiply(quantity, price);
            userBalance[quoteAsset].locked = subtract(userBalance[quoteAsset].locked, amount);
            userBalance[quoteAsset].available = add(userBalance[quoteAsset].available, amount);
        } else {
            userBalance[baseAsset].locked = subtract(userBalance[baseAsset].locked, quantity);
            userBalance[baseAsset].available = add(userBalance[baseAsset].available, quantity);
        }
    }

    onRamp(userId: string, amount: string) {
        const userBalance = this.balances.get(userId);
        if (!userBalance) {
            this.balances.set(userId, {
                [BASE_CURRENCY]: {
                    available: amount,
                    locked: "0"
                }
            });
        } else {
            if (!userBalance[BASE_CURRENCY]) {
                userBalance[BASE_CURRENCY] = { available: "0", locked: "0" };
            }
            userBalance[BASE_CURRENCY].available = add(userBalance[BASE_CURRENCY].available, amount);
        }
    }

    withdraw(userId: string, amount: string): { newBalance: string } {
        const userBalance = this.balances.get(userId);
        if (!userBalance || !userBalance[BASE_CURRENCY]) {
            throw new Error("User not found");
        }
        
        if (isLess(userBalance[BASE_CURRENCY].available, amount)) {
            throw new Error(`Insufficient balance. Available: ₹${userBalance[BASE_CURRENCY].available}`);
        }
        
        userBalance[BASE_CURRENCY].available = subtract(userBalance[BASE_CURRENCY].available, amount);
        
        return { newBalance: userBalance[BASE_CURRENCY].available };
    }

    /**
     * Set initial balances for test users using STRING values
     */
    setBaseBalances() {
        this.balances.set("1", {
            [BASE_CURRENCY]: {
                available: "1000000",  // ₹10 Lakh
                locked: "0"
            },
            "TATA": {
                available: "1000",     // 1000 shares
                locked: "0"
            }
        });

        this.balances.set("2", {
            [BASE_CURRENCY]: {
                available: "1000000",
                locked: "0"
            },
            "TATA": {
                available: "1000",
                locked: "0"
            }
        });

        this.balances.set("5", {
            [BASE_CURRENCY]: {
                available: "1000000",
                locked: "0"
            },
            "TATA": {
                available: "1000",
                locked: "0"
            }
        });
    }
}
