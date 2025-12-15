"use client";
import { useState, useEffect } from "react";
import { getBalance, deposit, withdraw } from "../utils/httpClient";

interface Balance {
    available: number;
    locked: number;
}

interface UserBalances {
    [asset: string]: Balance;
}

// Simulated user ID - in production, get from auth
const USER_ID = "1";

export default function FundsPage() {
    const [balances, setBalances] = useState<UserBalances>({});
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");
    const [amount, setAmount] = useState("");
    const [processing, setProcessing] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [bankAccount, setBankAccount] = useState("HDFC Bank ****1234");
    const [upiId, setUpiId] = useState("");

    // Fetch balances on mount
    useEffect(() => {
        fetchBalances();
    }, []);

    const fetchBalances = async () => {
        try {
            setLoading(true);
            const data = await getBalance(USER_ID);
            setBalances(data);
        } catch (error) {
            console.error("Failed to fetch balances:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeposit = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            setMessage({ type: "error", text: "Please enter a valid amount" });
            return;
        }

        setProcessing(true);
        setMessage(null);

        try {
            const result = await deposit(USER_ID, parseFloat(amount));
            setMessage({ type: "success", text: `₹${amount} added successfully!` });
            setAmount("");
            fetchBalances();
        } catch (error: any) {
            setMessage({ 
                type: "error", 
                text: error.response?.data?.error || "Deposit failed. Please try again." 
            });
        } finally {
            setProcessing(false);
        }
    };

    const handleWithdraw = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            setMessage({ type: "error", text: "Please enter a valid amount" });
            return;
        }

        const inrAvailable = balances.INR?.available || 0;
        if (parseFloat(amount) > inrAvailable) {
            setMessage({ type: "error", text: `Insufficient balance. Available: ₹${inrAvailable.toLocaleString()}` });
            return;
        }

        setProcessing(true);
        setMessage(null);

        try {
            const result = await withdraw(USER_ID, parseFloat(amount), bankAccount);
            if (result.success) {
                setMessage({ 
                    type: "success", 
                    text: `Withdrawal of ₹${amount} initiated. Transaction ID: ${result.transactionId}` 
                });
                setAmount("");
                fetchBalances();
            } else {
                setMessage({ type: "error", text: result.error || "Withdrawal failed" });
            }
        } catch (error: any) {
            setMessage({ 
                type: "error", 
                text: error.response?.data?.error || "Withdrawal failed. Please try again." 
            });
        } finally {
            setProcessing(false);
        }
    };

    const inrBalance = balances.INR || { available: 0, locked: 0 };
    const totalEquity = Object.entries(balances).reduce((sum, [asset, bal]) => {
        if (asset === "INR") return sum + bal.available + bal.locked;
        // Assume TATA is ~1000 INR per unit for display
        return sum + (bal.available + bal.locked) * 1000;
    }, 0);

    const quickAmounts = [1000, 5000, 10000, 25000, 50000];

    return (
        <div className="min-h-screen bg-[#0e0f14] text-white">
            {/* Header */}
            <div className="border-b border-slate-800 p-4">
                <h1 className="text-2xl font-bold">Funds</h1>
                <p className="text-gray-400 text-sm">Manage your deposits and withdrawals</p>
            </div>

            <div className="max-w-6xl mx-auto p-6">
                {/* Balance Overview Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {/* Available Cash */}
                    <div className="bg-gradient-to-br from-green-900/30 to-green-800/10 border border-green-500/30 rounded-xl p-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-gray-400 text-sm">Available Cash</span>
                            <span className="text-green-400 text-xs bg-green-500/20 px-2 py-1 rounded">Withdrawable</span>
                        </div>
                        <div className="text-3xl font-bold text-green-400">
                            {loading ? "..." : `₹${inrBalance.available.toLocaleString()}`}
                        </div>
                    </div>

                    {/* Margin Used */}
                    <div className="bg-gradient-to-br from-yellow-900/30 to-yellow-800/10 border border-yellow-500/30 rounded-xl p-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-gray-400 text-sm">Margin Used</span>
                            <span className="text-yellow-400 text-xs bg-yellow-500/20 px-2 py-1 rounded">In Orders</span>
                        </div>
                        <div className="text-3xl font-bold text-yellow-400">
                            {loading ? "..." : `₹${inrBalance.locked.toLocaleString()}`}
                        </div>
                    </div>

                    {/* Total Equity */}
                    <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/10 border border-blue-500/30 rounded-xl p-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-gray-400 text-sm">Total Equity</span>
                            <span className="text-blue-400 text-xs bg-blue-500/20 px-2 py-1 rounded">Estimated</span>
                        </div>
                        <div className="text-3xl font-bold text-blue-400">
                            {loading ? "..." : `₹${totalEquity.toLocaleString()}`}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Deposit/Withdraw Card */}
                    <div className="bg-[#16181d] border border-slate-800 rounded-xl overflow-hidden">
                        {/* Tabs */}
                        <div className="flex border-b border-slate-800">
                            <button
                                className={`flex-1 py-4 text-center font-semibold transition ${
                                    activeTab === "deposit"
                                        ? "bg-green-500/10 text-green-400 border-b-2 border-green-400"
                                        : "text-gray-400 hover:text-white"
                                }`}
                                onClick={() => { setActiveTab("deposit"); setMessage(null); }}
                            >
                                💰 Deposit
                            </button>
                            <button
                                className={`flex-1 py-4 text-center font-semibold transition ${
                                    activeTab === "withdraw"
                                        ? "bg-red-500/10 text-red-400 border-b-2 border-red-400"
                                        : "text-gray-400 hover:text-white"
                                }`}
                                onClick={() => { setActiveTab("withdraw"); setMessage(null); }}
                            >
                                🏧 Withdraw
                            </button>
                        </div>

                        <div className="p-6">
                            {activeTab === "deposit" ? (
                                <>
                                    {/* Payment Method */}
                                    <div className="mb-6">
                                        <label className="block text-sm text-gray-400 mb-2">Payment Method</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button className="p-3 border-2 border-green-500 bg-green-500/10 rounded-lg flex items-center gap-2">
                                                <span className="text-xl">📱</span>
                                                <span className="text-sm">UPI</span>
                                            </button>
                                            <button className="p-3 border border-slate-700 rounded-lg flex items-center gap-2 hover:border-slate-500">
                                                <span className="text-xl">🏦</span>
                                                <span className="text-sm">Net Banking</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* UPI ID */}
                                    <div className="mb-6">
                                        <label className="block text-sm text-gray-400 mb-2">UPI ID (Optional)</label>
                                        <input
                                            type="text"
                                            placeholder="yourname@upi"
                                            value={upiId}
                                            onChange={(e) => setUpiId(e.target.value)}
                                            className="w-full p-3 bg-[#0e0f14] border border-slate-700 rounded-lg text-white focus:border-green-500 focus:outline-none"
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* Bank Account */}
                                    <div className="mb-6">
                                        <label className="block text-sm text-gray-400 mb-2">Withdraw To</label>
                                        <div className="p-4 bg-[#0e0f14] border border-slate-700 rounded-lg flex items-center gap-4">
                                            <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                                                🏦
                                            </div>
                                            <div>
                                                <div className="font-medium">{bankAccount}</div>
                                                <div className="text-xs text-gray-500">Primary Bank Account</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Available Balance Info */}
                                    <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                                        <div className="flex items-center gap-2 text-yellow-400 text-sm">
                                            <span>⚡</span>
                                            <span>Withdrawable: ₹{inrBalance.available.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Amount Input */}
                            <div className="mb-4">
                                <label className="block text-sm text-gray-400 mb-2">Amount</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl">₹</span>
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className="w-full p-4 pl-10 bg-[#0e0f14] border border-slate-700 rounded-lg text-2xl text-white focus:border-green-500 focus:outline-none"
                                    />
                                </div>
                            </div>

                            {/* Quick Amount Buttons */}
                            <div className="flex flex-wrap gap-2 mb-6">
                                {quickAmounts.map((amt) => (
                                    <button
                                        key={amt}
                                        onClick={() => setAmount(amt.toString())}
                                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm"
                                    >
                                        ₹{amt.toLocaleString()}
                                    </button>
                                ))}
                                {activeTab === "withdraw" && (
                                    <button
                                        onClick={() => setAmount(inrBalance.available.toString())}
                                        className="px-4 py-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg text-sm"
                                    >
                                        Max
                                    </button>
                                )}
                            </div>

                            {/* Message */}
                            {message && (
                                <div className={`mb-4 p-3 rounded-lg ${
                                    message.type === "success" 
                                        ? "bg-green-500/20 border border-green-500/30 text-green-400" 
                                        : "bg-red-500/20 border border-red-500/30 text-red-400"
                                }`}>
                                    {message.text}
                                </div>
                            )}

                            {/* Submit Button */}
                            <button
                                onClick={activeTab === "deposit" ? handleDeposit : handleWithdraw}
                                disabled={processing || !amount}
                                className={`w-full py-4 rounded-xl font-bold text-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${
                                    activeTab === "deposit"
                                        ? "bg-green-500 hover:bg-green-600 text-white"
                                        : "bg-red-500 hover:bg-red-600 text-white"
                                }`}
                            >
                                {processing 
                                    ? "Processing..." 
                                    : activeTab === "deposit" 
                                        ? `Add ₹${amount || "0"}` 
                                        : `Withdraw ₹${amount || "0"}`
                                }
                            </button>
                        </div>
                    </div>

                    {/* Holdings Card */}
                    <div className="bg-[#16181d] border border-slate-800 rounded-xl overflow-hidden">
                        <div className="p-4 border-b border-slate-800">
                            <h2 className="text-lg font-semibold">Your Holdings</h2>
                        </div>

                        <div className="p-4">
                            {loading ? (
                                <div className="text-center py-8 text-gray-400">Loading...</div>
                            ) : Object.keys(balances).length === 0 ? (
                                <div className="text-center py-8 text-gray-400">
                                    <div className="text-4xl mb-2">💼</div>
                                    <div>No holdings yet</div>
                                    <div className="text-sm">Deposit funds to start trading!</div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {Object.entries(balances).map(([asset, balance]) => (
                                        <div 
                                            key={asset} 
                                            className="flex items-center justify-between p-4 bg-[#0e0f14] rounded-lg"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
                                                    asset === "INR" ? "bg-green-500/20 text-green-400" : "bg-blue-500/20 text-blue-400"
                                                }`}>
                                                    {asset === "INR" ? "₹" : asset.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="font-medium">{asset}</div>
                                                    <div className="text-xs text-gray-500">
                                                        {asset === "INR" ? "Indian Rupee" : asset}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-medium">
                                                    {asset === "INR" 
                                                        ? `₹${(balance.available + balance.locked).toLocaleString()}`
                                                        : (balance.available + balance.locked).toLocaleString()
                                                    }
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    Available: {asset === "INR" ? "₹" : ""}{balance.available.toLocaleString()}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Info Section */}
                        <div className="p-4 border-t border-slate-800">
                            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                                <h3 className="font-medium text-blue-400 mb-2">💡 Quick Info</h3>
                                <ul className="text-sm text-gray-400 space-y-1">
                                    <li>• Deposits are instant via UPI</li>
                                    <li>• Withdrawals take 1-2 business days</li>
                                    <li>• Margin used = funds in open orders</li>
                                    <li>• Trade TATA stocks with your balance</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

