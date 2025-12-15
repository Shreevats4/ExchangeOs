"use client";

import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface User {
    id: string;
    name: string;
    email?: string;
}

export const Appbar = () => {
    const route = usePathname();
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        // Check if user is logged in
        const storedUser = localStorage.getItem("user");
        if (storedUser) {
            try {
                setUser(JSON.parse(storedUser));
            } catch {
                setUser(null);
            }
        }
    }, []);

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setUser(null);
        router.push("/");
    };

    return <div className="text-white border-b border-slate-800">
        <div className="flex justify-between items-center p-2">
            <div className="flex">
                <div className={`text-xl pl-4 flex flex-col justify-center cursor-pointer text-white font-bold`} onClick={() => router.push('/')}>
                    📈 Exchange
                </div>
                <div className={`text-sm pt-1 flex flex-col justify-center pl-8 cursor-pointer ${route.startsWith('/markets') ? 'text-white' : 'text-slate-500'}`} onClick={() => router.push('/markets')}>
                    Markets
                </div>
                <div className={`text-sm pt-1 flex flex-col justify-center pl-8 cursor-pointer ${route.startsWith('/trade') ? 'text-white' : 'text-slate-500'}`} onClick={() => router.push('/trade/TATA_INR')}>
                    Trade
                </div>
                <div className={`text-sm pt-1 flex flex-col justify-center pl-8 cursor-pointer ${route.startsWith('/funds') ? 'text-white' : 'text-slate-500'}`} onClick={() => router.push('/funds')}>
                    Funds
                </div>
            </div>
            <div className="flex items-center gap-3 p-2 mr-2">
                {user ? (
                    <>
                        <button 
                            onClick={() => router.push('/funds')}
                            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition flex items-center gap-2"
                        >
                            <span>💰</span> Deposit
                        </button>
                        <button 
                            onClick={() => router.push('/funds')}
                            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition flex items-center gap-2"
                        >
                            <span>🏧</span> Withdraw
                        </button>
                        <div className="flex items-center gap-2 ml-2 pl-3 border-l border-slate-700">
                            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-sm font-bold">
                                {user.name?.charAt(0).toUpperCase() || "U"}
                            </div>
                            <span className="text-sm text-gray-300">{user.name || "User"}</span>
                            <button
                                onClick={handleLogout}
                                className="ml-2 px-3 py-1 text-sm text-gray-400 hover:text-white hover:bg-slate-700 rounded transition"
                            >
                                Logout
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <button 
                            onClick={() => router.push('/auth/login')}
                            className="px-4 py-2 text-white hover:bg-slate-700 font-medium rounded-lg transition"
                        >
                            Login
                        </button>
                        <button 
                            onClick={() => router.push('/auth/register')}
                            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition"
                        >
                            Register
                        </button>
                    </>
                )}
            </div>
        </div>
    </div>
}