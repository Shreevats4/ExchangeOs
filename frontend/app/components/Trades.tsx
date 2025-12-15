"use client";

import { useEffect, useState } from "react";
import { getTrades } from "../utils/httpClient";
import { SignalingManager } from "../utils/SignalingManager";

// Local trade interface for this component
interface LocalTrade {
    id: string;
    price: string;
    quantity: string;
    timestamp: number;
    isBuyerMaker: boolean;
}

export function Trades({ market }: { market: string }) {
    const [trades, setTrades] = useState<LocalTrade[]>([]);

    useEffect(() => {
        // Fetch initial trades via HTTP
        getTrades(market).then((t) => {
            if (Array.isArray(t)) {
                // Map API trades to LocalTrade format
                const mappedTrades: LocalTrade[] = t.slice(0, 50).map((trade: any) => ({
                    id: String(trade.id),
                    price: trade.price,
                    quantity: trade.quantity,
                    timestamp: trade.timestamp || Date.now(),
                    isBuyerMaker: trade.isBuyerMaker || false,
                }));
                setTrades(mappedTrades);
            }
        });

        // Register callback for real-time trade updates
        SignalingManager.getInstance().registerCallback(
            "trade",
            (data: any) => {
                const newTrade: LocalTrade = {
                    id: data.t?.toString() || Date.now().toString(),
                    price: data.p,
                    quantity: data.q,
                    timestamp: Date.now(),
                    isBuyerMaker: data.m,
                };
                
                setTrades((prevTrades: LocalTrade[]) => {
                    // Add new trade at the beginning, keep max 50
                    const updated = [newTrade, ...prevTrades].slice(0, 50);
                    return updated;
                });
            },
            `TRADE-${market}`
        );

        // Subscribe to trade channel
        SignalingManager.getInstance().sendMessage({
            method: "SUBSCRIBE",
            params: [`trade@${market}`],
        });

        // Cleanup on unmount
        return () => {
            SignalingManager.getInstance().sendMessage({
                method: "UNSUBSCRIBE",
                params: [`trade@${market}`],
            });
            SignalingManager.getInstance().deRegisterCallback("trade", `TRADE-${market}`);
        };
    }, [market]);

    return (
        <div className="flex flex-col h-full">
            <div className="flex justify-between text-xs text-slate-500 px-2 py-1 border-b border-slate-700">
                <span>Price</span>
                <span>Size</span>
                <span>Time</span>
            </div>
            <div className="flex-1 overflow-y-auto">
                {trades.length === 0 ? (
                    <div className="text-center text-slate-500 py-4">No trades yet</div>
                ) : (
                    trades.map((trade, index) => (
                        <TradeRow key={`${trade.id}-${index}`} trade={trade} />
                    ))
                )}
            </div>
        </div>
    );
}

function TradeRow({ trade }: { trade: LocalTrade }) {
    const time = new Date(trade.timestamp);
    const timeStr = time.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });

    return (
        <div className="flex justify-between text-sm px-2 py-1 hover:bg-slate-800">
            <span className={trade.isBuyerMaker ? "text-red-500" : "text-green-500"}>
                {parseFloat(trade.price).toFixed(2)}
            </span>
            <span className="text-slate-300">
                {parseFloat(trade.quantity).toFixed(4)}
            </span>
            <span className="text-slate-500">{timeStr}</span>
        </div>
    );
}

