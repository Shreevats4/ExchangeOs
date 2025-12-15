/**
 * @orderbook/shared
 * 
 * Shared types and constants used across all services:
 * - API
 * - Engine
 * - WebSocket Server
 * - Database Processor
 */

// ============================================================================
// MESSAGE TYPE CONSTANTS
// ============================================================================

// API to Engine message types
export const CREATE_ORDER = "CREATE_ORDER" as const;
export const CANCEL_ORDER = "CANCEL_ORDER" as const;
export const ON_RAMP = "ON_RAMP" as const;
export const GET_DEPTH = "GET_DEPTH" as const;
export const GET_OPEN_ORDERS = "GET_OPEN_ORDERS" as const;
export const GET_BALANCE = "GET_BALANCE" as const;

// Database message types
export const TRADE_ADDED = "TRADE_ADDED" as const;
export const ORDER_UPDATE = "ORDER_UPDATE" as const;

// WebSocket subscription methods
export const SUBSCRIBE = "SUBSCRIBE" as const;
export const UNSUBSCRIBE = "UNSUBSCRIBE" as const;

// ============================================================================
// SHARED INTERFACES
// ============================================================================

/**
 * Order representation
 */
export interface Order {
    orderId: string;
    userId: string;
    price: number;
    quantity: number;
    filled: number;
    side: "buy" | "sell";
}

/**
 * Fill (matched trade) representation
 */
export interface Fill {
    price: string;
    qty: number;
    tradeId: number;
    otherUserId?: string;
    markerOrderId?: string;
}

/**
 * User balance for a single asset
 */
export interface AssetBalance {
    available: number;
    locked: number;
}

/**
 * User's complete balance map
 */
export interface UserBalance {
    [asset: string]: AssetBalance;
}

/**
 * Depth entry: [price, quantity]
 */
export type DepthEntry = [string, string];

/**
 * Orderbook depth
 */
export interface Depth {
    bids: DepthEntry[];
    asks: DepthEntry[];
}

/**
 * Market ticker information
 */
export interface Ticker {
    symbol: string;
    lastPrice: string;
    high: string;
    low: string;
    volume: string;
    quoteVolume?: string;
    priceChange?: string;
    priceChangePercent?: string;
}

/**
 * Trade representation
 */
export interface Trade {
    id: number | string;
    price: string;
    quantity: string;
    quoteQuantity?: string;
    timestamp: number;
    isBuyerMaker: boolean;
    market?: string;
}

// ============================================================================
// API TO ENGINE MESSAGES
// ============================================================================

export interface CreateOrderData {
    market: string;
    price: string;
    quantity: string;
    side: "buy" | "sell";
    userId: string;
}

export interface CancelOrderData {
    orderId: string;
    market: string;
}

export interface OnRampData {
    amount: string;
    userId: string;
    txnId: string;
}

export interface GetDepthData {
    market: string;
}

export interface GetOpenOrdersData {
    userId: string;
    market: string;
}

export interface GetBalanceData {
    userId: string;
}

/**
 * All possible messages from API to Engine
 */
export type MessageFromApi =
    | { type: typeof CREATE_ORDER; data: CreateOrderData }
    | { type: typeof CANCEL_ORDER; data: CancelOrderData }
    | { type: typeof ON_RAMP; data: OnRampData }
    | { type: typeof GET_DEPTH; data: GetDepthData }
    | { type: typeof GET_OPEN_ORDERS; data: GetOpenOrdersData }
    | { type: typeof GET_BALANCE; data: GetBalanceData };

// ============================================================================
// ENGINE TO API MESSAGES
// ============================================================================

export interface OrderPlacedPayload {
    orderId: string;
    executedQty: number;
    fills: Fill[];
}

export interface OrderCancelledPayload {
    orderId: string;
    executedQty: number;
    remainingQty: number;
}

export interface DepthPayload {
    bids: DepthEntry[];
    asks: DepthEntry[];
}

export interface OpenOrdersPayload {
    orderId: string;
    price: number | string;
    quantity: number | string;
    filled?: number;
    executedQty?: number;
    side: "buy" | "sell";
    userId: string;
}

/**
 * All possible messages from Engine to API
 */
export type MessageFromEngine =
    | { type: "ORDER_PLACED"; payload: OrderPlacedPayload }
    | { type: "ORDER_CANCELLED"; payload: OrderCancelledPayload }
    | { type: "DEPTH"; payload: DepthPayload }
    | { type: "OPEN_ORDERS"; payload: OpenOrdersPayload[] }
    | { type: "BALANCE"; payload: UserBalance }
    | { type: "ON_RAMP_SUCCESS"; payload: { userId: string; amount: number } };

// ============================================================================
// DATABASE MESSAGES
// ============================================================================

export interface TradeAddedData {
    id: string;
    market: string;
    price: string;
    quantity: string;
    quoteQuantity: string;
    isBuyerMaker: boolean;
    timestamp: number;
    buyerUserId?: string;
    sellerUserId?: string;
}

export interface OrderUpdateData {
    orderId: string;
    executedQty: number;
    market?: string;
    price?: string;
    quantity?: string;
    side?: "buy" | "sell";
    userId?: string;
    status?: "open" | "partial" | "filled" | "cancelled";
}

/**
 * All possible messages to Database Processor
 */
export type DbMessage =
    | { type: typeof TRADE_ADDED; data: TradeAddedData }
    | { type: typeof ORDER_UPDATE; data: OrderUpdateData };

// ============================================================================
// WEBSOCKET MESSAGES
// ============================================================================

/**
 * WebSocket subscription message
 */
export interface WsSubscriptionMessage {
    method: typeof SUBSCRIBE | typeof UNSUBSCRIBE;
    params: string[];
    id?: number;
}

/**
 * Depth update event
 */
export interface DepthUpdateEvent {
    e: "depth";
    b: DepthEntry[];  // bids
    a: DepthEntry[];  // asks
}

/**
 * Trade update event
 */
export interface TradeUpdateEvent {
    e: "trade";
    t: number;      // trade id
    m: boolean;     // is buyer maker
    p: string;      // price
    q: string;      // quantity
    s: string;      // symbol
}

/**
 * User trade update event
 */
export interface UserTradeUpdateEvent {
    e: "userTrade";
    t: number;      // trade id
    s: string;      // symbol
    p: string;      // price
    q: string;      // quantity
    side: "buy" | "sell";
    role: "maker" | "taker";
    timestamp: number;
}

/**
 * Ticker update event
 */
export interface TickerUpdateEvent {
    e: "ticker";
    s: string;      // symbol
    c: string;      // last price
    h: string;      // high
    l: string;      // low
    v: string;      // volume
    V: string;      // quote volume
}

/**
 * All possible WebSocket events from Engine
 */
export type WsEvent =
    | DepthUpdateEvent
    | TradeUpdateEvent
    | UserTradeUpdateEvent
    | TickerUpdateEvent;

/**
 * WebSocket message wrapper
 */
export interface WsMessage {
    stream: string;
    data: WsEvent;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Extract payload type from MessageFromEngine by type
 */
export type ExtractPayload<T extends MessageFromEngine["type"]> = Extract<
    MessageFromEngine,
    { type: T }
>["payload"];

/**
 * Market identifier (e.g., "TATA_INR", "BTC_USDT")
 */
export type MarketSymbol = string;

/**
 * User identifier
 */
export type UserId = string;

/**
 * Order identifier
 */
export type OrderId = string;

/**
 * Base currency (e.g., "INR", "USDT")
 */
export const BASE_CURRENCY = "INR";

