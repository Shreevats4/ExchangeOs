"use client";
import { useState, useEffect } from "react";
import { placeOrder, getBalance } from "../utils/httpClient";

// User ID - in production, get from auth
const USER_ID = "1";

interface Balance {
    available: number;
    locked: number;
}

interface UserBalances {
    [asset: string]: Balance;
}

export function SwapUI({ market }: {market: string}) {
    const [price, setPrice] = useState('1000');
    const [quantity, setQuantity] = useState('1');
    const [activeTab, setActiveTab] = useState('buy');
    const [type, setType] = useState('limit');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [balances, setBalances] = useState<UserBalances>({});

    // Extract base and quote assets from market (e.g., "TATA_INR" -> "TATA", "INR")
    const [baseAsset, quoteAsset] = market.split('_');

    const total = (parseFloat(price) || 0) * (parseFloat(quantity) || 0);

    // Fetch user balances
    const fetchBalances = async () => {
        try {
            const data = await getBalance(USER_ID);
            setBalances(data || {});
        } catch (error) {
            console.error("Failed to fetch balances:", error);
        }
    };

    useEffect(() => {
        fetchBalances();
        // Refresh balance every 5 seconds
        const interval = setInterval(fetchBalances, 5000);
        return () => clearInterval(interval);
    }, []);

    // Get available balance for current operation
    const availableForBuy = balances[quoteAsset]?.available || 0;
    const availableForSell = balances[baseAsset]?.available || 0;
    const currentAvailable = activeTab === 'buy' ? availableForBuy : availableForSell;
    const currentAsset = activeTab === 'buy' ? quoteAsset : baseAsset;

    // Calculate max quantity user can buy/sell
    const calculateMaxQuantity = () => {
        if (activeTab === 'buy') {
            const priceNum = parseFloat(price) || 1;
            return Math.floor(availableForBuy / priceNum);
        } else {
            return availableForSell;
        }
    };

    const maxQuantity = calculateMaxQuantity();

    const handlePlaceOrder = async () => {
        if (!price || !quantity || parseFloat(price) <= 0 || parseFloat(quantity) <= 0) {
            setMessage({ type: 'error', text: 'Please enter valid price and quantity' });
            return;
        }

        setLoading(true);
        setMessage(null);

        try {
            const result = await placeOrder(
                market,
                price,
                quantity,
                activeTab as "buy" | "sell",
                "1" // userId - in production, get from auth
            );

            const filledQty = result.executedQty;
            const remainingQty = parseFloat(quantity) - filledQty;

            if (filledQty === parseFloat(quantity)) {
                setMessage({ 
                    type: 'success', 
                    text: `Order fully filled! ${filledQty} ${baseAsset} @ ${price} ${quoteAsset}` 
                });
            } else if (filledQty > 0) {
                setMessage({ 
                    type: 'success', 
                    text: `Partially filled: ${filledQty}/${quantity} ${baseAsset}. Order ID: ${result.orderId}` 
                });
            } else {
                setMessage({ 
                    type: 'success', 
                    text: `Order placed! ID: ${result.orderId}. Waiting in orderbook.` 
                });
            }

            // Reset quantity after successful order
            setQuantity('1');
            // Refresh balances
            fetchBalances();
        } catch (error: any) {
            console.error('Order failed:', error);
            setMessage({ 
                type: 'error', 
                text: error.response?.data?.error || 'Failed to place order. Check if all services are running.' 
            });
        } finally {
            setLoading(false);
        }
    };

    return <div>
        <div className="flex flex-col">
            <div className="flex flex-row h-[60px]">
                <BuyButton activeTab={activeTab} setActiveTab={setActiveTab} />
                <SellButton activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>
            <div className="flex flex-col gap-1">
                <div className="px-3">
                    <div className="flex flex-row flex-0 gap-5 undefined">
                        <LimitButton type={type} setType={setType} />
                        <MarketButton type={type} setType={setType} />                       
                    </div>
                </div>
                <div className="flex flex-col px-3">
                    <div className="flex flex-col flex-1 gap-3 text-baseTextHighEmphasis">
                        <div className="flex flex-col gap-2 p-2 bg-slate-800/30 rounded-lg">
                            <div className="flex items-center justify-between flex-row">
                                <p className="text-xs font-normal text-gray-400">Available {currentAsset}</p>
                                <p className="font-medium text-sm text-white">
                                    {activeTab === 'buy' ? '₹' : ''}{currentAvailable.toLocaleString()} {activeTab === 'sell' ? baseAsset : ''}
                                </p>
                            </div>
                            <div className="flex items-center justify-between flex-row">
                                <p className="text-xs font-normal text-gray-400">
                                    {activeTab === 'buy' ? 'Max Buy' : 'Max Sell'}
                                </p>
                                <p className="font-medium text-xs text-gray-300">
                                    {maxQuantity.toLocaleString()} {baseAsset}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <p className="text-xs font-normal text-baseTextMedEmphasis">
                                Price
                            </p>
                            <div className="flex flex-col relative">
                                <input 
                                    step="0.01" 
                                    placeholder="0" 
                                    className="h-12 rounded-lg border-2 border-solid border-baseBorderLight bg-[var(--background)] pr-12 text-right text-2xl leading-9 text-[$text] placeholder-baseTextMedEmphasis ring-0 transition focus:border-accentBlue focus:ring-0" 
                                    type="text" 
                                    value={price}
                                    onChange={(e) => setPrice(e.target.value)}
                                />
                                <div className="flex flex-row absolute right-1 top-1 p-2">
                                    <div className="relative">
                                        <span className="text-sm text-baseTextMedEmphasis">{quoteAsset}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2">
                        <p className="text-xs font-normal text-baseTextMedEmphasis">
                            Quantity
                        </p>
                        <div className="flex flex-col relative">
                            <input 
                                step="0.01" 
                                placeholder="0" 
                                className="h-12 rounded-lg border-2 border-solid border-baseBorderLight bg-[var(--background)] pr-12 text-right text-2xl leading-9 text-[$text] placeholder-baseTextMedEmphasis ring-0 transition focus:border-accentBlue focus:ring-0" 
                                type="text" 
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                            />
                            <div className="flex flex-row absolute right-1 top-1 p-2">
                                <div className="relative">
                                    <span className="text-sm text-baseTextMedEmphasis">{baseAsset}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end flex-row">
                            <p className="font-medium pr-2 text-xs text-baseTextMedEmphasis">≈ {total.toLocaleString()} {quoteAsset}</p>
                        </div>
                        <div className="flex justify-center flex-row mt-2 gap-2">
                            <button 
                                className="flex items-center justify-center flex-row rounded-full px-[16px] py-[6px] text-xs cursor-pointer bg-slate-700 hover:bg-slate-600 transition"
                                onClick={() => setQuantity(Math.floor(maxQuantity * 0.25).toString())}
                            >
                                25%
                            </button>
                            <button 
                                className="flex items-center justify-center flex-row rounded-full px-[16px] py-[6px] text-xs cursor-pointer bg-slate-700 hover:bg-slate-600 transition"
                                onClick={() => setQuantity(Math.floor(maxQuantity * 0.5).toString())}
                            >
                                50%
                            </button>
                            <button 
                                className="flex items-center justify-center flex-row rounded-full px-[16px] py-[6px] text-xs cursor-pointer bg-slate-700 hover:bg-slate-600 transition"
                                onClick={() => setQuantity(Math.floor(maxQuantity * 0.75).toString())}
                            >
                                75%
                            </button>
                            <button 
                                className="flex items-center justify-center flex-row rounded-full px-[16px] py-[6px] text-xs cursor-pointer bg-blue-600 hover:bg-blue-500 transition"
                                onClick={() => setQuantity(maxQuantity.toString())}
                            >
                                Max
                            </button>
                        </div>
                    </div>
                    {message && (
                        <div className={`text-sm p-2 rounded-lg mt-2 ${
                            message.type === 'success' 
                                ? 'bg-green-500/20 text-green-400' 
                                : 'bg-red-500/20 text-red-400'
                        }`}>
                            {message.text}
                        </div>
                    )}
                    <button 
                        type="button" 
                        className={`font-semibold focus:ring-blue-200 focus:none focus:outline-none text-center h-12 rounded-xl text-base px-4 py-2 my-4 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed ${
                            activeTab === 'buy' 
                                ? 'bg-greenPrimaryButtonBackground text-greenPrimaryButtonText' 
                                : 'bg-redPrimaryButtonBackground text-redPrimaryButtonText'
                        }`}
                        onClick={handlePlaceOrder}
                        disabled={loading}
                    >
                        {loading ? 'Placing order...' : `${activeTab === 'buy' ? 'Buy' : 'Sell'} ${baseAsset}`}
                    </button>
                    <div className="flex justify-between flex-row mt-1">
                        <div className="flex flex-row gap-2">
                            <div className="flex items-center">
                                <input 
                                    className="form-checkbox rounded border border-solid border-baseBorderMed bg-base-950 font-light text-transparent shadow-none shadow-transparent outline-none ring-0 ring-transparent checked:border-baseBorderMed checked:bg-base-900 checked:hover:border-baseBorderMed focus:bg-base-900 focus:ring-0 focus:ring-offset-0 focus:checked:border-baseBorderMed cursor-pointer h-5 w-5" 
                                    id="postOnly" 
                                    type="checkbox" 
                                />
                                <label htmlFor="postOnly" className="ml-2 text-xs cursor-pointer">Post Only</label>
                            </div>
                            <div className="flex items-center">
                                <input 
                                    className="form-checkbox rounded border border-solid border-baseBorderMed bg-base-950 font-light text-transparent shadow-none shadow-transparent outline-none ring-0 ring-transparent checked:border-baseBorderMed checked:bg-base-900 checked:hover:border-baseBorderMed focus:bg-base-900 focus:ring-0 focus:ring-offset-0 focus:checked:border-baseBorderMed cursor-pointer h-5 w-5" 
                                    id="ioc" 
                                    type="checkbox" 
                                />
                                <label htmlFor="ioc" className="ml-2 text-xs cursor-pointer">IOC</label>
                            </div>
                        </div>
                </div>
            </div>
        </div>
    </div>
</div>
}

function LimitButton({ type, setType }: { type: string, setType: (type: string) => void }) {
    return <div className="flex flex-col cursor-pointer justify-center py-2" onClick={() => setType('limit')}>
    <div className={`text-sm font-medium py-1 border-b-2 ${type === 'limit' ? "border-accentBlue text-baseTextHighEmphasis" : "border-transparent text-baseTextMedEmphasis hover:border-baseTextHighEmphasis hover:text-baseTextHighEmphasis"}`}>
        Limit
    </div>
</div>
}

function MarketButton({ type, setType }: { type: string, setType: (type: string) => void }) {
    return  <div className="flex flex-col cursor-pointer justify-center py-2" onClick={() => setType('market')}>
    <div className={`text-sm font-medium py-1 border-b-2 ${type === 'market' ? "border-accentBlue text-baseTextHighEmphasis" : "border-b-2 border-transparent text-baseTextMedEmphasis hover:border-baseTextHighEmphasis hover:text-baseTextHighEmphasis"} `}>
        Market
    </div>
    </div>
}

function BuyButton({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: string) => void }) {
    return <div className={`flex flex-col mb-[-2px] flex-1 cursor-pointer justify-center border-b-2 p-4 ${activeTab === 'buy' ? 'border-b-greenBorder bg-greenBackgroundTransparent' : 'border-b-baseBorderMed hover:border-b-baseBorderFocus'}`} onClick={() => setActiveTab('buy')}>
        <p className="text-center text-sm font-semibold text-greenText">
            Buy
        </p>
    </div>
}

function SellButton({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: string) => void }) {
    return <div className={`flex flex-col mb-[-2px] flex-1 cursor-pointer justify-center border-b-2 p-4 ${activeTab === 'sell' ? 'border-b-redBorder bg-redBackgroundTransparent' : 'border-b-baseBorderMed hover:border-b-baseBorderFocus'}`} onClick={() => setActiveTab('sell')}>
        <p className="text-center text-sm font-semibold text-redText">
            Sell
        </p>
    </div>
}
