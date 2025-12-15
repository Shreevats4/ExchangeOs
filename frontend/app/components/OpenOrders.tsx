"use client";
import { useEffect, useState } from "react";
import { getOpenOrders, cancelOrder } from "../utils/httpClient";

interface Order {
    orderId: string;
    price: string;
    quantity: string;
    executedQty: number;
    side: "buy" | "sell";
    userId: string;
}

// Simulated user ID - in production, get from auth
const USER_ID = "1";

export function OpenOrders({ market }: { market: string }) {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling] = useState<string | null>(null);

    const fetchOrders = async () => {
        try {
            const data = await getOpenOrders(USER_ID, market);
            setOrders(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Failed to fetch orders:", error);
            setOrders([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
        // Refresh orders every 5 seconds
        const interval = setInterval(fetchOrders, 5000);
        return () => clearInterval(interval);
    }, [market]);

    const handleCancel = async (orderId: string) => {
        setCancelling(orderId);
        try {
            await cancelOrder(orderId, market);
            // Remove from local state
            setOrders(prev => prev.filter(o => o.orderId !== orderId));
        } catch (error) {
            console.error("Failed to cancel order:", error);
        } finally {
            setCancelling(null);
        }
    };

    const handleCancelAll = async () => {
        for (const order of orders) {
            await handleCancel(order.orderId);
        }
    };

    if (loading) {
        return (
            <div className="p-4 text-center text-gray-400">
                Loading orders...
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">Open Orders</span>
                    <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-full">
                        {orders.length}
                    </span>
                </div>
                {orders.length > 0 && (
                    <button
                        onClick={handleCancelAll}
                        className="text-xs text-red-400 hover:text-red-300 transition"
                    >
                        Cancel All
                    </button>
                )}
            </div>

            {/* Orders List */}
            <div className="flex-1 overflow-y-auto">
                {orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                        <span className="text-2xl mb-2">📋</span>
                        <span className="text-sm">No open orders</span>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-800">
                        {orders.map((order) => (
                            <div 
                                key={order.orderId} 
                                className="p-3 hover:bg-slate-800/50 transition"
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                                            order.side === "buy" 
                                                ? "bg-green-500/20 text-green-400" 
                                                : "bg-red-500/20 text-red-400"
                                        }`}>
                                            {order.side.toUpperCase()}
                                        </span>
                                        <span className="text-sm font-medium">
                                            {market.split("_")[0]}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => handleCancel(order.orderId)}
                                        disabled={cancelling === order.orderId}
                                        className="text-xs text-gray-400 hover:text-red-400 transition disabled:opacity-50"
                                    >
                                        {cancelling === order.orderId ? "..." : "✕"}
                                    </button>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <div className="text-gray-400">
                                        <span className="text-white">{parseFloat(order.quantity || "0").toFixed(2)}</span>
                                        {" @ "}
                                        <span className="text-white">₹{parseFloat(order.price || "0").toFixed(2)}</span>
                                    </div>
                                    <div className="text-gray-500">
                                        Filled: {(() => {
                                            const qty = parseFloat(order.quantity || "1");
                                            const filled = order.executedQty || 0;
                                            const percent = qty > 0 ? (filled / qty) * 100 : 0;
                                            return isNaN(percent) ? 0 : percent.toFixed(0);
                                        })()}%
                                    </div>
                                </div>
                                {/* Progress bar */}
                                <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full ${order.side === "buy" ? "bg-green-500" : "bg-red-500"}`}
                                        style={{ 
                                            width: `${(() => {
                                                const qty = parseFloat(order.quantity || "1");
                                                const filled = order.executedQty || 0;
                                                const percent = qty > 0 ? (filled / qty) * 100 : 0;
                                                return isNaN(percent) ? 0 : percent;
                                            })()}%` 
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

