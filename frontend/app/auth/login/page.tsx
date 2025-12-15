"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const response = await fetch("http://localhost:3000/api/v1/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (data.success) {
                // Store token
                localStorage.setItem("token", data.token);
                localStorage.setItem("user", JSON.stringify(data.user));
                
                // Redirect to trading page
                router.push("/trade/TATA_INR");
            } else {
                setError(data.error || "Login failed");
            }
        } catch (err) {
            setError("Connection failed. Please check if the server is running.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0e0f14] flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">Exchange</h1>
                    <p className="text-gray-400">Welcome back! Login to trade.</p>
                </div>

                {/* Login Form */}
                <form onSubmit={handleLogin} className="bg-[#16181d] rounded-xl p-8 border border-slate-800">
                    <h2 className="text-xl font-semibold text-white mb-6">Login</h2>

                    {error && (
                        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full p-3 bg-[#0e0f14] border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                                placeholder="you@example.com"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="w-full p-3 bg-[#0e0f14] border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                                placeholder="••••••••"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? "Logging in..." : "Login"}
                        </button>
                    </div>

                    <div className="mt-6 text-center">
                        <p className="text-gray-400 text-sm">
                            Don't have an account?{" "}
                            <Link href="/auth/register" className="text-blue-400 hover:text-blue-300">
                                Register here
                            </Link>
                        </p>
                    </div>
                </form>

                {/* Demo Login */}
                <div className="mt-6 p-4 bg-slate-800/50 rounded-lg">
                    <p className="text-gray-400 text-sm text-center mb-3">Quick Demo Access</p>
                    <button
                        onClick={() => {
                            localStorage.setItem("user", JSON.stringify({ id: "1", name: "Demo User" }));
                            router.push("/trade/TATA_INR");
                        }}
                        className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition text-sm"
                    >
                        Continue as Demo User
                    </button>
                </div>
            </div>
        </div>
    );
}

