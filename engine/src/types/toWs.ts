// Types shared between WS layer and Engine
// See also: shared/src/index.ts for the shared types package

export type TickerUpdateMessage = {
    stream: string, 
    data: {
        c?: string,
        h?: string,
        l?: string,
        v?: string,
        V?: string,
        s?: string,
        id: number,
        e: "ticker"
    }
}

export type DepthUpdateMessage = {
    stream: string,
    data: {
        b?: [string, string][],
        a?: [string, string][],
        e: "depth"
    }
}

export type TradeAddedMessage = {
    stream: string,
    data: {
        e: "trade",
        t: number,
        m: boolean,
        p: string,
        q: string,
        s: string, // symbol
    }
}

export type UserTradeMessage = {
    stream: string,
    data: {
        e: "userTrade",
        t: number,      // trade id
        s: string,      // symbol
        p: string,      // price
        q: string,      // quantity
        side: "buy" | "sell",
        role: "maker" | "taker",
        timestamp: number,
    }
}

export type WsMessage = TickerUpdateMessage | DepthUpdateMessage | TradeAddedMessage | UserTradeMessage;
