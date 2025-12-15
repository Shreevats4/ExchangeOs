import { useEffect, useRef, useState, useCallback } from "react";
import { ChartManager } from "../utils/ChartManager";
import { getKlines } from "../utils/httpClient";
import { KLine } from "../utils/types";
import { SignalingManager } from "../utils/SignalingManager";

// Timeframe options like Zerodha/TradingView
const TIMEFRAMES = [
  { label: "1m", value: "1m", seconds: 60 },
  { label: "5m", value: "5m", seconds: 300 },
  { label: "15m", value: "15m", seconds: 900 },
  { label: "1H", value: "1h", seconds: 3600 },
  { label: "4H", value: "4h", seconds: 14400 },
  { label: "1D", value: "1d", seconds: 86400 },
  { label: "1W", value: "1w", seconds: 604800 },
];

export function TradeView({
  market,
}: {
  market: string;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartManagerRef = useRef<ChartManager>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState("1h");
  const [chartType, setChartType] = useState<"candle" | "line">("candle");

  // Handle incoming trade data to update chart in real-time
  const handleTradeUpdate = useCallback((trade: { p: string; q: string; t: number }) => {
    if (chartManagerRef.current) {
      const price = parseFloat(trade.p);
      const now = new Date();
      
      // Update the current candle with the new price
      chartManagerRef.current.update({
        close: price,
        high: price,
        low: price,
        open: price,
        timestamp: now,
      });
      
      setLastUpdate(now);
      setIsLive(true);
    }
  }, []);

  // Load chart data when market or timeframe changes
  const loadChartData = useCallback(async () => {
    let klineData: KLine[] = [];
    const timeframe = TIMEFRAMES.find(t => t.value === selectedTimeframe);
    const lookbackMs = (timeframe?.seconds || 3600) * 1000 * 200; // 200 candles
    
    try {
      klineData = await getKlines(
        market, 
        selectedTimeframe, 
        Math.floor((new Date().getTime() - lookbackMs) / 1000), 
        Math.floor(new Date().getTime() / 1000)
      ); 
    } catch (e) {
      console.error("Failed to fetch klines:", e);
    }

    if (chartRef.current) {
      if (chartManagerRef.current) {
        chartManagerRef.current.destroy();
      }
      
      const chartManager = new ChartManager(
        chartRef.current,
        [
          ...klineData?.map((x) => ({
            close: parseFloat(x.close),
            high: parseFloat(x.high),
            low: parseFloat(x.low),
            open: parseFloat(x.open),
            timestamp: new Date(x.end), 
          })),
        ].sort((x, y) => (x.timestamp < y.timestamp ? -1 : 1)) || [],
        {
          background: "#0e0f14",
          color: "white",
        }
      );
      //@ts-ignore
      chartManagerRef.current = chartManager;
    }
  }, [market, selectedTimeframe]);

  useEffect(() => {
    loadChartData();

    // Subscribe to live trade updates
    SignalingManager.getInstance().registerCallback(
      "trade",
      handleTradeUpdate,
      `TRADE-CHART-${market}`
    );

    SignalingManager.getInstance().sendMessage({
      method: "SUBSCRIBE",
      params: [`trade@${market}`]
    });

    return () => {
      SignalingManager.getInstance().deRegisterCallback("trade", `TRADE-CHART-${market}`);
      SignalingManager.getInstance().sendMessage({
        method: "UNSUBSCRIBE",
        params: [`trade@${market}`]
      });
    };
  }, [market, handleTradeUpdate, loadChartData]);

  // Auto-refresh chart data every 30 seconds to get latest candles
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      loadChartData();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(refreshInterval);
  }, [loadChartData]);

  return (
    <div className="relative flex flex-col h-full">
      {/* Chart Toolbar - Like Zerodha/TradingView */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-[#0e0f14]">
        {/* Timeframe Selector */}
        <div className="flex items-center gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setSelectedTimeframe(tf.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition ${
                selectedTimeframe === tf.value
                  ? "bg-blue-500 text-white"
                  : "text-gray-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Chart Controls */}
        <div className="flex items-center gap-3">
          {/* Chart Type Toggle */}
          <div className="flex items-center gap-1 bg-slate-800 rounded p-0.5">
            <button
              onClick={() => setChartType("candle")}
              className={`px-2 py-1 text-xs rounded transition ${
                chartType === "candle"
                  ? "bg-slate-700 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
              title="Candlestick"
            >
              📊
            </button>
            <button
              onClick={() => setChartType("line")}
              className={`px-2 py-1 text-xs rounded transition ${
                chartType === "line"
                  ? "bg-slate-700 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
              title="Line"
            >
              📈
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={loadChartData}
            className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-slate-800 rounded transition"
            title="Refresh Chart"
          >
            🔄
          </button>

          {/* Live Indicator */}
          <div className="flex items-center gap-2 px-2 py-1 rounded text-xs">
            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></span>
            <span className="text-gray-400">
              {isLive ? 'LIVE' : 'Waiting...'}
            </span>
          </div>
        </div>
      </div>

      {/* Chart Container */}
      <div ref={chartRef} style={{ height: "480px", width: "100%" }}></div>
      
      {/* Last Update Time */}
      {lastUpdate && (
        <div className="absolute bottom-2 right-2 text-xs text-gray-500 bg-black/50 px-2 py-1 rounded">
          Last trade: {lastUpdate.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
