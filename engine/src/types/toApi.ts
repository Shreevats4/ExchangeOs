import { Order } from "../trade/Orderbook";

export const CREATE_ORDER = "CREATE_ORDER";
export const CANCEL_ORDER = "CANCEL_ORDER";
export const ON_RAMP = "ON_RAMP";

export const GET_DEPTH = "GET_DEPTH";

// User balance type - using strings for precision
export interface UserBalance {
    [asset: string]: {
        available: string;
        locked: string;
    };
}

export type MessageToApi = {
    type: "DEPTH",
    payload: {
        bids: [string, string][],
        asks: [string, string][],
    }
} | {
    type: "ORDER_PLACED",
    payload: {
        orderId: string,
        executedQty: string,  // String for precision
        fills: {
            price: string,
            qty: string,      // String for precision
            tradeId: number
        }[]
    }
} | {
    type: "ORDER_CANCELLED",
    payload: {
        orderId: string,
        executedQty: string,  // String for precision
        remainingQty: string  // String for precision
    }
} | {
    type: "OPEN_ORDERS",
    payload: Order[]
} | {
    type: "BALANCE",
    payload: UserBalance | Record<string, never>
} | {
    type: "ON_RAMP_SUCCESS",
    payload: {
        userId: string,
        amount: string,       // String for precision
        newBalance: string    // String for precision
    }
} | {
    type: "WITHDRAW_SUCCESS",
    payload: {
        userId: string,
        amount: string,       // String for precision
        newBalance: string,   // String for precision
        txnId: string
    }
} | {
    type: "WITHDRAW_FAILED",
    payload: {
        error: string
    }
} | {
    type: "ORDER_REJECTED",
    payload: {
        orderId: string,
        executedQty: string,  // String for precision
        remainingQty: string, // String for precision
        reason: string,
        code: string
    }
}
