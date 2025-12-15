"use client";

import { useEffect, useState } from "react";
import { Ticker } from "../utils/types";
import { getTickers } from "../utils/httpClient";
import { useRouter } from "next/navigation";

// Token icon mapping - add more as needed
const TOKEN_ICONS: { [key: string]: string } = {
    "TATA": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Tata_logo.svg/1200px-Tata_logo.svg.png",
    "BTC": "https://cryptologos.cc/logos/bitcoin-btc-logo.png",
    "ETH": "https://cryptologos.cc/logos/ethereum-eth-logo.png",
    "SOL": "https://cryptologos.cc/logos/solana-sol-logo.png",
    "USDT": "https://cryptologos.cc/logos/tether-usdt-logo.png",
    "DEFAULT": "https://via.placeholder.com/40x40?text=?"
};

// Token name mapping
const TOKEN_NAMES: { [key: string]: string } = {
    "TATA": "Tata Motors",
    "BTC": "Bitcoin",
    "ETH": "Ethereum",
    "SOL": "Solana",
    "USDT": "Tether",
};

function getTokenIcon(symbol: string): string {
    const baseAsset = symbol.split("_")[0];
    return TOKEN_ICONS[baseAsset] || TOKEN_ICONS["DEFAULT"];
}

function getTokenName(symbol: string): string {
    const baseAsset = symbol.split("_")[0];
    return TOKEN_NAMES[baseAsset] || baseAsset;
}

export const Markets = () => {
    const [tickers, setTickers] = useState<Ticker[]>();

    useEffect(() => {
        getTickers().then((m) => setTickers(m));
    }, []);

    return (
        <div className="flex flex-col flex-1 max-w-[1280px] w-full">
            <div className="flex flex-col min-w-[700px] flex-1 w-full">
                <div className="flex flex-col w-full rounded-lg bg-slate-800/50 px-5 py-3">
                    <table className="w-full table-auto">
                        <MarketHeader />
                        <tbody>
                            {tickers?.map((m) => (
                                <MarketRow key={m.symbol} market={m} />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

function MarketRow({ market }: { market: Ticker }) {
    const router = useRouter();
    const isPositive = Number(market.priceChangePercent) >= 0;

    return (
        <tr 
            className="cursor-pointer border-t border-slate-700 hover:bg-slate-700/50 transition-colors" 
            onClick={() => router.push(`/trade/${market.symbol}`)}
        >
            <td className="px-1 py-3">
                <div className="flex items-center">
                    <div className="relative w-10 h-10 overflow-hidden rounded-full border border-slate-600 bg-white">
                        <img
                            alt={market.symbol}
                            src={getTokenIcon(market.symbol)}
                            loading="lazy"
                            width="40"
                            height="40"
                            className="object-contain p-1"
                        />
                    </div>
                    <div className="ml-4 flex flex-col">
                        <p className="text-base font-medium text-white">
                            {market.symbol}
                        </p>
                        <p className="text-xs text-slate-400">
                            {getTokenName(market.symbol)}
                        </p>
                    </div>
                </div>
            </td>
            <td className="px-1 py-3">
                <p className="text-base font-medium text-white tabular-nums">
                    ₹{parseFloat(market.lastPrice).toLocaleString()}
                </p>
            </td>
            <td className="px-1 py-3">
                <p className="text-base font-medium text-slate-300 tabular-nums">
                    ₹{parseFloat(market.high).toLocaleString()}
                </p>
            </td>
            <td className="px-1 py-3">
                <p className="text-base font-medium text-slate-300 tabular-nums">
                    {parseFloat(market.volume).toLocaleString()}
                </p>
            </td>
            <td className="px-1 py-3">
                <p className={`text-base font-medium tabular-nums ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                    {isPositive ? '+' : ''}{Number(market.priceChangePercent).toFixed(2)}%
                </p>
            </td>
        </tr>
    );
}

function MarketHeader() {
    return (
        <thead>
            <tr>
                <th className="px-2 py-3 text-left text-sm font-normal text-slate-400">Name</th>
                <th className="px-2 py-3 text-left text-sm font-normal text-slate-400">Price</th>
                <th className="px-2 py-3 text-left text-sm font-normal text-slate-400">24h High</th>
                <th className="px-2 py-3 text-left text-sm font-normal text-slate-400">24h Volume</th>
                <th className="px-2 py-3 text-left text-sm font-normal text-slate-400">24h Change</th>
            </tr>
        </thead>
    );
}
