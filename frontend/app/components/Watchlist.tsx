"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getTickers } from "../utils/httpClient";
import { Ticker } from "../utils/types";
import { SignalingManager } from "../utils/SignalingManager";

interface WatchlistItem {
    symbol: string;
    lastPrice: string;
    priceChange: string;
    priceChangePercent: string;
    high: string;
    low: string;
    volume: string;
}

// Default watchlist symbols
const DEFAULT_WATCHLIST = ["TATA_INR"];

export function Watchlist({ currentMarket }: { currentMarket?: string }) {
    const router = useRouter();
    const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTickers = async () => {
            try {
                const tickers = await getTickers();
                const items = tickers.map((t: Ticker) => ({
                    symbol: t.symbol,
                    lastPrice: t.lastPrice || "0",
                    priceChange: t.priceChange || "0",
                    priceChangePercent: t.priceChangePercent || "0",
                    high: t.high || "0",
                    low: t.low || "0",
                    volume: t.volume || "0",
                }));
                setWatchlist(items);
            } catch (error) {
                console.error("Failed to fetch tickers:", error);
                // Fallback with mock data
                setWatchlist([
                    {
                        symbol: "TATA_INR",
                        lastPrice: "1000.00",
                        priceChange: "15.50",
                        priceChangePercent: "1.57",
                        high: "1020.00",
                        low: "985.00",
                        volume: "125000",
                    }
                ]);
            } finally {
                setLoading(false);
            }
        };

        fetchTickers();

        // Subscribe to ticker updates
        DEFAULT_WATCHLIST.forEach(symbol => {
            SignalingManager.getInstance().registerCallback(
                "ticker",
                (data: Partial<Ticker>) => {
                    if (data.symbol) {
                        setWatchlist(prev => prev.map(item => 
                            item.symbol === data.symbol 
                                ? { ...item, lastPrice: data.lastPrice || item.lastPrice }
                                : item
                        ));
                    }
                },
                `WATCHLIST-TICKER-${symbol}`
            );

            SignalingManager.getInstance().sendMessage({
                method: "SUBSCRIBE",
                params: [`ticker@${symbol}`]
            });
        });

        return () => {
            DEFAULT_WATCHLIST.forEach(symbol => {
                SignalingManager.getInstance().deRegisterCallback("ticker", `WATCHLIST-TICKER-${symbol}`);
                SignalingManager.getInstance().sendMessage({
                    method: "UNSUBSCRIBE",
                    params: [`ticker@${symbol}`]
                });
            });
        };
    }, []);

    const handleSelectMarket = (symbol: string) => {
        router.push(`/trade/${symbol}`);
    };

    return (
        <div className="flex flex-col h-full bg-[#0e0f14]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <span className="font-semibold text-sm">Watchlist</span>
                <button className="text-xs text-blue-400 hover:text-blue-300">
                    + Add
                </button>
            </div>

            {/* Watchlist Items */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="p-4 text-center text-gray-400">Loading...</div>
                ) : watchlist.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                        <span className="text-2xl mb-2">⭐</span>
                        <span className="text-sm">No items in watchlist</span>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-800">
                        {watchlist.map((item) => {
                            const isPositive = parseFloat(item.priceChange) >= 0;
                            const isActive = item.symbol === currentMarket;
                            
                            return (
                                <div 
                                    key={item.symbol}
                                    onClick={() => handleSelectMarket(item.symbol)}
                                    className={`p-3 cursor-pointer transition ${
                                        isActive 
                                            ? "bg-blue-500/10 border-l-2 border-blue-500" 
                                            : "hover:bg-slate-800/50"
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center text-xs font-bold text-blue-400">
                                                {item.symbol.charAt(0)}
                                            </div>
                                            <span className="font-medium text-sm">
                                                {item.symbol.replace("_", "/")}
                                            </span>
                                        </div>
                                        <span className={`text-sm font-medium ${
                                            isPositive ? "text-green-400" : "text-red-400"
                                        }`}>
                                            ₹{parseFloat(item.lastPrice).toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-500">
                                            Vol: {(parseFloat(item.volume) / 1000).toFixed(1)}K
                                        </span>
                                        <span className={`text-xs ${
                                            isPositive ? "text-green-400" : "text-red-400"
                                        }`}>
                                            {isPositive ? "+" : ""}{parseFloat(item.priceChangePercent).toFixed(2)}%
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Market Stats */}
            <div className="p-3 border-t border-slate-800">
                <div className="text-xs text-gray-500 mb-2">Market Overview</div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-800/50 rounded p-2">
                        <div className="text-xs text-gray-400">24h High</div>
                        <div className="text-sm text-green-400">
                            ₹{watchlist[0] ? parseFloat(watchlist[0].high).toFixed(2) : "0.00"}
                        </div>
                    </div>
                    <div className="bg-slate-800/50 rounded p-2">
                        <div className="text-xs text-gray-400">24h Low</div>
                        <div className="text-sm text-red-400">
                            ₹{watchlist[0] ? parseFloat(watchlist[0].low).toFixed(2) : "0.00"}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

