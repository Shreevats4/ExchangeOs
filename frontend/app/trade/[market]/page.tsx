"use client";
import { useState } from "react";
import { MarketBar } from "@/app/components/MarketBar";
import { SwapUI } from "@/app/components/SwapUI";
import { TradeView } from "@/app/components/TradeView";
import { Depth } from "@/app/components/depth/Depth";
import { Trades } from "@/app/components/Trades";
import { OpenOrders } from "@/app/components/OpenOrders";
import { OrderHistory } from "@/app/components/OrderHistory";
import { Watchlist } from "@/app/components/Watchlist";
import { useParams } from "next/navigation";

type RightPanelTab = "orderbook" | "trades";
type BottomPanelTab = "orders" | "history" | "positions";

export default function Page() {
    const { market } = useParams();
    const [rightTab, setRightTab] = useState<RightPanelTab>("orderbook");
    const [bottomTab, setBottomTab] = useState<BottomPanelTab>("orders");
    const [showWatchlist, setShowWatchlist] = useState(true);

    return (
        <div className="flex flex-row h-screen bg-[#0e0f14]">
            {/* Left Sidebar - Watchlist */}
            {showWatchlist && (
                <div className="w-[200px] border-r border-slate-800 flex flex-col">
                    <Watchlist currentMarket={market as string} />
                </div>
            )}

            {/* Main Trading Area */}
            <div className="flex flex-col flex-1 min-w-0">
                {/* Market Bar */}
                <MarketBar market={market as string} />

                {/* Main Content */}
                <div className="flex flex-row flex-1 border-t border-slate-800">
                    {/* Chart + Bottom Panel */}
                    <div className="flex flex-col flex-1">
                        {/* Chart */}
                        <div className="h-[520px] border-b border-slate-800">
                            <TradeView market={market as string} />
                        </div>

                        {/* Bottom Panel - Orders/History/Positions */}
                        <div className="flex-1 flex flex-col min-h-[200px]">
                            {/* Tabs */}
                            <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-800 bg-[#0e0f14]">
                                {(["orders", "history", "positions"] as const).map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setBottomTab(tab)}
                                        className={`px-4 py-1.5 text-xs font-medium rounded transition ${
                                            bottomTab === tab
                                                ? "bg-blue-500/20 text-blue-400"
                                                : "text-gray-400 hover:text-white hover:bg-slate-800"
                                        }`}
                                    >
                                        {tab === "orders" && "📋 Open Orders"}
                                        {tab === "history" && "📜 Trade History"}
                                        {tab === "positions" && "💼 Positions"}
                                    </button>
                                ))}

                                {/* Toggle Watchlist Button */}
                                <button
                                    onClick={() => setShowWatchlist(!showWatchlist)}
                                    className="ml-auto px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-slate-800 rounded transition"
                                >
                                    {showWatchlist ? "◀ Hide" : "▶ Watchlist"}
                                </button>
                            </div>

                            {/* Panel Content */}
                            <div className="flex-1 overflow-hidden">
                                {bottomTab === "orders" && (
                                    <OpenOrders market={market as string} />
                                )}
                                {bottomTab === "history" && (
                                    <OrderHistory market={market as string} />
                                )}
                                {bottomTab === "positions" && (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                        <span className="text-2xl mb-2">💼</span>
                                        <span className="text-sm">No open positions</span>
                                        <span className="text-xs text-gray-600">
                                            Your holdings will appear here
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Panel - Orderbook/Trades */}
                    <div className="w-[280px] flex flex-col border-l border-slate-800">
                        {/* Tabs */}
                        <div className="flex border-b border-slate-800">
                            <button
                                onClick={() => setRightTab("orderbook")}
                                className={`flex-1 py-2 text-xs font-medium transition ${
                                    rightTab === "orderbook"
                                        ? "text-white border-b-2 border-blue-500"
                                        : "text-gray-400 hover:text-white"
                                }`}
                            >
                                Order Book
                            </button>
                            <button
                                onClick={() => setRightTab("trades")}
                                className={`flex-1 py-2 text-xs font-medium transition ${
                                    rightTab === "trades"
                                        ? "text-white border-b-2 border-blue-500"
                                        : "text-gray-400 hover:text-white"
                                }`}
                            >
                                Recent Trades
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-hidden">
                            {rightTab === "orderbook" ? (
                                <Depth market={market as string} />
                            ) : (
                                <Trades market={market as string} />
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Sidebar - Order Form */}
            <div className="w-[280px] border-l border-slate-800 flex flex-col bg-[#0e0f14]">
                <SwapUI market={market as string} />
            </div>
        </div>
    );
}