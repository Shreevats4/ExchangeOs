
export const CREATE_ORDER = "CREATE_ORDER";
export const CANCEL_ORDER = "CANCEL_ORDER";
export const ON_RAMP = "ON_RAMP";
export const WITHDRAW = "WITHDRAW";
export const GET_OPEN_ORDERS = "GET_OPEN_ORDERS";
export const GET_BALANCE = "GET_BALANCE";

export const GET_DEPTH = "GET_DEPTH";

export type MessageFromOrderbook = {
    type: "DEPTH",
    payload: {
        market: string,
        bids: [string, string][],
        asks: [string, string][],
    }
} | {
    type: "ORDER_PLACED",
    payload: {
        orderId: string,
        executedQty: number,
        fills: [
            {
                price: string,
                qty: number,
                tradeId: number
            }
        ]
    }
} | {
    type: "ORDER_CANCELLED",
    payload: {
        orderId: string,
        executedQty: number,
        remainingQty: number
    }
} | {
    type: "OPEN_ORDERS",
    payload: {
        orderId: string,
        executedQty: number,
        price: string,
        quantity: string,
        side: "buy" | "sell",
        userId: string
    }[]
} | {
    type: "BALANCE",
    payload: {
        [asset: string]: {
            available: number,
            locked: number
        }
    }
} | {
    type: "ON_RAMP_SUCCESS",
    payload: {
        userId: string,
        amount: number,
        newBalance: number
    }
} | {
    type: "WITHDRAW_SUCCESS",
    payload: {
        userId: string,
        amount: number,
        newBalance: number,
        txnId: string
    }
} | {
    type: "WITHDRAW_FAILED",
    payload: {
        error: string
    }
}