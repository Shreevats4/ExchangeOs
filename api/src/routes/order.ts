import { Router, Request, Response } from "express";
import { RedisManager } from "../RedisManager";
import { CREATE_ORDER, CANCEL_ORDER, GET_OPEN_ORDERS } from "../types";

export const orderRouter = Router();

// Type definitions for request bodies
interface CreateOrderRequest {
    market: string;
    price: string;
    quantity: string;
    side: "buy" | "sell";
    userId: string;
}

interface CancelOrderRequest {
    orderId: string;
    market: string;
}

// Type definitions for responses
interface Fill {
    price: string;
    qty: number;
    tradeId: number;
}

interface OrderPlacedResponse {
    type: "ORDER_PLACED";
    payload: {
        orderId: string;
        executedQty: number;
        fills: Fill[];
    };
}

interface OrderCancelledResponse {
    type: "ORDER_CANCELLED";
    payload: {
        orderId: string;
        executedQty: number;
        remainingQty: number;
    };
}

interface OrderRejectedResponse {
    type: "ORDER_REJECTED";
    payload: {
        orderId: string;
        executedQty: number;
        remainingQty: number;
        reason: string;
        code: string;
    };
}

interface OpenOrder {
    orderId: string;
    price: string | number;
    quantity: string | number;
    executedQty?: number;
    filled?: number;
    side: "buy" | "sell";
    userId: string;
}

interface OpenOrdersResponse {
    type: "OPEN_ORDERS";
    payload: OpenOrder[];
}

type OrderResponse = OrderPlacedResponse | OrderCancelledResponse | OrderRejectedResponse | OpenOrdersResponse;

// POST /api/v1/order - Place a new order
orderRouter.post("/", async (req: Request<{}, {}, CreateOrderRequest>, res: Response) => {
    const { market, price, quantity, side, userId } = req.body;
    
    // Validation
    if (!market || !price || !quantity || !side || !userId) {
        return res.status(400).json({ 
            error: "Missing required fields: market, price, quantity, side, userId" 
        });
    }

    if (side !== "buy" && side !== "sell") {
        return res.status(400).json({ error: "side must be 'buy' or 'sell'" });
    }

    console.log({ market, price, quantity, side, userId });

    try {
        const response = await RedisManager.getInstance().sendAndAwait({
            type: CREATE_ORDER,
            data: { market, price, quantity, side, userId },
        }) as OrderPlacedResponse | OrderRejectedResponse;

        // Handle self-trade prevention rejection
        if (response.type === "ORDER_REJECTED") {
            return res.status(400).json({
                error: response.payload.reason,
                code: response.payload.code,
                message: "Order rejected - you cannot trade with yourself"
            });
        }

        res.json(response.payload);
    } catch (error) {
        console.error("Error placing order:", error);
        res.status(500).json({ error: "Failed to place order" });
    }
});

// DELETE /api/v1/order - Cancel an order
orderRouter.delete("/", async (req: Request<{}, {}, CancelOrderRequest>, res: Response) => {
    const { orderId, market } = req.body;

    if (!orderId || !market) {
        return res.status(400).json({ 
            error: "Missing required fields: orderId, market" 
        });
    }

    try {
        const response = await RedisManager.getInstance().sendAndAwait({
            type: CANCEL_ORDER,
            data: { orderId, market },
        }) as OrderCancelledResponse;

        res.json(response.payload);
    } catch (error) {
        console.error("Error cancelling order:", error);
        res.status(500).json({ error: "Failed to cancel order" });
    }
});

// GET /api/v1/order/open - Get user's open orders
orderRouter.get("/open", async (req: Request, res: Response) => {
    const { userId, market } = req.query;

    if (!userId || !market) {
        return res.status(400).json({ 
            error: "Missing required query params: userId, market" 
        });
    }

    try {
        const response = await RedisManager.getInstance().sendAndAwait({
            type: GET_OPEN_ORDERS,
            data: {
                userId: userId as string,
                market: market as string,
            },
        });

        res.json(response.payload);
    } catch (error) {
        console.error("Error fetching open orders:", error);
        res.status(500).json({ error: "Failed to fetch open orders" });
    }
});
