import { Markets } from "./components/Markets";

export default function Home() {
    return (
        <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
            {/* Hero Section */}
            <div className="flex flex-col items-center justify-center py-16 px-4">
                <h1 className="text-5xl font-bold text-white mb-4">
                    Trade <span className="text-green-400">Smarter</span>
                </h1>
                <p className="text-slate-400 text-lg mb-8 text-center max-w-2xl">
                    A real-time cryptocurrency exchange with lightning-fast order matching,
                    live orderbook updates, and professional trading charts.
                </p>
                <div className="flex gap-4">
                    <a 
                        href="/trade/TATA_INR" 
                        className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                    >
                        Start Trading
                    </a>
                    <a 
                        href="#markets" 
                        className="border border-slate-600 hover:border-slate-500 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                    >
                        View Markets
                    </a>
                </div>
            </div>

            {/* Stats Section */}
            <div className="flex justify-center gap-16 py-8 border-y border-slate-700">
                <div className="text-center">
                    <div className="text-3xl font-bold text-white">$1.2B+</div>
                    <div className="text-slate-400">24h Volume</div>
                </div>
                <div className="text-center">
                    <div className="text-3xl font-bold text-white">100+</div>
                    <div className="text-slate-400">Trading Pairs</div>
                </div>
                <div className="text-center">
                    <div className="text-3xl font-bold text-white">&lt;1ms</div>
                    <div className="text-slate-400">Latency</div>
                </div>
            </div>

            {/* Markets Section */}
            <div id="markets" className="max-w-7xl mx-auto px-4 py-12">
                <h2 className="text-2xl font-bold text-white mb-6">Markets</h2>
                <Markets />
            </div>
        </main>
    );
}
