"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        phone: "",
        password: "",
        confirmPassword: "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        // Validation
        if (formData.password !== formData.confirmPassword) {
            setError("Passwords do not match");
            setLoading(false);
            return;
        }

        if (formData.password.length < 8) {
            setError("Password must be at least 8 characters");
            setLoading(false);
            return;
        }

        try {
            const response = await fetch("http://localhost:3000/api/v1/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formData.name,
                    email: formData.email,
                    phone: formData.phone,
                    password: formData.password,
                }),
            });

            const data = await response.json();

            if (data.success) {
                setSuccess(true);
                // Store token
                localStorage.setItem("token", data.token);
                localStorage.setItem("user", JSON.stringify(data.user));
                
                // Redirect after 2 seconds
                setTimeout(() => {
                    router.push("/trade/TATA_INR");
                }, 2000);
            } else {
                setError(data.error || "Registration failed");
            }
        } catch (err) {
            setError("Connection failed. Please check if the server is running.");
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-[#0e0f14] flex items-center justify-center p-4">
                <div className="text-center">
                    <div className="text-6xl mb-4">🎉</div>
                    <h2 className="text-2xl font-bold text-white mb-2">Registration Successful!</h2>
                    <p className="text-gray-400 mb-4">Your account has been created.</p>
                    <p className="text-sm text-gray-500">Redirecting to trading page...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0e0f14] flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">Exchange</h1>
                    <p className="text-gray-400">Create your trading account</p>
                </div>

                {/* Registration Form */}
                <form onSubmit={handleRegister} className="bg-[#16181d] rounded-xl p-8 border border-slate-800">
                    <h2 className="text-xl font-semibold text-white mb-6">Register</h2>

                    {error && (
                        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Full Name *</label>
                            <input
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                required
                                className="w-full p-3 bg-[#0e0f14] border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                                placeholder="John Doe"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Email *</label>
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                required
                                className="w-full p-3 bg-[#0e0f14] border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                                placeholder="you@example.com"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Phone Number</label>
                            <input
                                type="tel"
                                name="phone"
                                value={formData.phone}
                                onChange={handleChange}
                                className="w-full p-3 bg-[#0e0f14] border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                                placeholder="+91 98765 43210"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Password *</label>
                            <input
                                type="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                required
                                minLength={8}
                                className="w-full p-3 bg-[#0e0f14] border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                                placeholder="Min 8 characters"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Confirm Password *</label>
                            <input
                                type="password"
                                name="confirmPassword"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                required
                                className="w-full p-3 bg-[#0e0f14] border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                                placeholder="••••••••"
                            />
                        </div>

                        {/* Terms */}
                        <div className="flex items-start gap-2">
                            <input
                                type="checkbox"
                                required
                                className="mt-1 rounded border-slate-700 bg-[#0e0f14]"
                            />
                            <p className="text-xs text-gray-400">
                                I agree to the{" "}
                                <a href="#" className="text-blue-400 hover:underline">Terms of Service</a>
                                {" "}and{" "}
                                <a href="#" className="text-blue-400 hover:underline">Privacy Policy</a>
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? "Creating account..." : "Create Account"}
                        </button>
                    </div>

                    <div className="mt-6 text-center">
                        <p className="text-gray-400 text-sm">
                            Already have an account?{" "}
                            <Link href="/auth/login" className="text-blue-400 hover:text-blue-300">
                                Login here
                            </Link>
                        </p>
                    </div>
                </form>

                {/* Info */}
                <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <h3 className="font-medium text-blue-400 mb-2">📋 After Registration</h3>
                    <ul className="text-sm text-gray-400 space-y-1">
                        <li>• Complete KYC to start trading</li>
                        <li>• Deposit funds to your account</li>
                        <li>• Start trading TATA shares!</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}

