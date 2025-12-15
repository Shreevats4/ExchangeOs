
import { Router } from "express";

export const tickersRouter = Router();

tickersRouter.get("/", async (req, res) => {    
    // Return an array of tickers
    res.json([
        {
            symbol: "TATA_INR",
            lastPrice: "1000",
            high: "1050",
            low: "950",
            volume: "50000",
            quoteVolume: "50000000",
            priceChange: "10",
            priceChangePercent: "1.0"
        },
        {
            symbol: "SOL_USDC",
            lastPrice: "135",
            high: "140",
            low: "130",
            volume: "100000",
            quoteVolume: "13500000",
            priceChange: "5",
            priceChangePercent: "3.85"
        }
    ]);
});