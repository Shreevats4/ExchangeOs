"use client";
import { useEffect, useState } from "react";
import { SignalingManager } from "../utils/SignalingManager";

interface TradeHistory {
    tradeId: number;
    market: string;
    price: string;
    quantity: string;
    side: "buy" | "sell";
    role: "maker" | "taker";
    timestamp: number;
}

// Simulated user ID - in production, get from auth
const USER_ID = "1";

export function OrderHistory({ market }: { market: string }) {
    const [trades, setTrades] = useState<TradeHistory[]>([]);
    const [filter, setFilter] = useState<"all" | "buy" | "sell">("all");

    useEffect(() => {
        // Subscribe to user-specific trade updates
        SignalingManager.getInstance().registerCallback(
            "userTrade",
            (trade: any) => {
                const newTrade: TradeHistory = {
                    tradeId: trade.t,
                    market: trade.s,
                    price: trade.p,
                    quantity: trade.q,
                    side: trade.side,
                    role: trade.role,
                    timestamp: trade.timestamp,
                };
                setTrades(prev => [newTrade, ...prev].slice(0, 50)); // Keep last 50 trades
            },
            `USER-TRADES-${USER_ID}`
        );

        SignalingManager.getInstance().sendMessage({
            method: "SUBSCRIBE",
            params: [`userTrades@${USER_ID}`]
        });

        return () => {
            SignalingManager.getInstance().deRegisterCallback("userTrade", `USER-TRADES-${USER_ID}`);
            SignalingManager.getInstance().sendMessage({
                method: "UNSUBSCRIBE",
                params: [`userTrades@${USER_ID}`]
            });
        };
    }, []);

    const filteredTrades = trades.filter(t => {
        if (filter === "all") return true;
        return t.side === filter;
    });

    return (
        <div className="flex flex-col h-full bg-[#0e0f14]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
                <span className="font-semibold text-sm">Trade History</span>
                {/* Filter Tabs */}
                <div className="flex gap-1">
                    {(["all", "buy", "sell"] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-2 py-1 text-xs rounded transition ${
                                filter === f
                                    ? "bg-slate-700 text-white"
                                    : "text-gray-400 hover:text-white"
                            }`}
                        >
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Trade List */}
            <div className="flex-1 overflow-y-auto">
                {filteredTrades.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                        <span className="text-2xl mb-2">📜</span>
                        <span className="text-sm">No trade history</span>
                        <span className="text-xs text-gray-600">Your executed trades will appear here</span>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-800">
                        {filteredTrades.map((trade, index) => (
                            <div 
                                key={`${trade.tradeId}-${index}`} 
                                className="px-4 py-2 hover:bg-slate-800/30 transition"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs font-bold ${
                                            trade.side === "buy" ? "text-green-400" : "text-red-400"
                                        }`}>
                                            {trade.side.toUpperCase()}
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            {trade.role === "maker" ? "M" : "T"}
                                        </span>
                                    </div>
                                    <span className="text-xs text-gray-500">
                                        {new Date(trade.timestamp).toLocaleTimeString()}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between mt-1 text-sm">
                                    <span className="text-white">
                                        {parseFloat(trade.quantity).toFixed(4)}
                                    </span>
                                    <span className="text-gray-400">
                                        @ ₹{parseFloat(trade.price).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

