import axios from "axios";
import { Depth, KLine, Ticker, Trade } from "./types";

// const BASE_URL = "https://exchange-proxy.100xdevs.com/api/v1";
const BASE_URL = "http://localhost:3000/api/v1";

export async function getTicker(market: string): Promise<Ticker> {
    const tickers = await getTickers();
    const ticker = tickers.find(t => t.symbol === market);
    if (!ticker) {
        throw new Error(`No ticker found for ${market}`);
    }
    return ticker;
}

export async function getTickers(): Promise<Ticker[]> {
    const response = await axios.get(`${BASE_URL}/tickers`);
    return response.data;
}


export async function getDepth(market: string): Promise<Depth> {
    const response = await axios.get(`${BASE_URL}/depth?symbol=${market}`);
    return response.data;
}
export async function getTrades(market: string): Promise<Trade[]> {
    const response = await axios.get(`${BASE_URL}/trades?symbol=${market}`);
    return response.data;
}

export async function getKlines(market: string, interval: string, startTime: number, endTime: number): Promise<KLine[]> {
    const response = await axios.get(`${BASE_URL}/klines?symbol=${market}&interval=${interval}&startTime=${startTime}&endTime=${endTime}`);
    const data: KLine[] = response.data;
    return data.sort((x, y) => (Number(x.end) < Number(y.end) ? -1 : 1));
}

// Place a new order
export async function placeOrder(
    market: string,
    price: string,
    quantity: string,
    side: "buy" | "sell",
    userId: string = "1"
): Promise<{ orderId: string; executedQty: number; fills: any[] }> {
    const response = await axios.post(`${BASE_URL}/order`, {
        market,
        price,
        quantity,
        side,
        userId
    });
    return response.data;
}

// Cancel an order
export async function cancelOrder(orderId: string, market: string): Promise<any> {
    const response = await axios.delete(`${BASE_URL}/order`, {
        data: { orderId, market }
    });
    return response.data;
}

// Get user's open orders
export async function getOpenOrders(userId: string, market: string): Promise<any[]> {
    const response = await axios.get(`${BASE_URL}/order/open?userId=${userId}&market=${market}`);
    return response.data;
}

// Get user's balance
export async function getBalance(userId: string): Promise<any> {
    const response = await axios.get(`${BASE_URL}/balance?userId=${userId}`);
    return response.data;
}

// Deposit funds (On-ramp)
export async function deposit(
    userId: string,
    amount: number
): Promise<{ success: boolean; message: string; newBalance?: number }> {
    const response = await axios.post(`${BASE_URL}/onramp`, {
        userId,
        amount
    });
    return response.data;
}

// Withdraw funds
export async function withdraw(
    userId: string,
    amount: number,
    bankAccount?: string
): Promise<{ success: boolean; message: string; transactionId?: string; newBalance?: number; error?: string }> {
    const response = await axios.post(`${BASE_URL}/withdraw`, {
        userId,
        amount,
        bankAccount
    });
    return response.data;
}