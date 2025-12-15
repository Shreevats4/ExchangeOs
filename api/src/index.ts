import express from "express";
import cors from "cors";
import { orderRouter } from "./routes/order";
import { depthRouter } from "./routes/depth";
import { tradesRouter } from "./routes/trades";
import { klineRouter } from "./routes/kline";
import { tickersRouter } from "./routes/ticker";
import { balanceRouter } from "./routes/balance";
import { onrampRouter } from "./routes/onramp";
import { withdrawRouter } from "./routes/withdraw";
import { authRouter } from "./routes/auth";

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API Routes
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/order", orderRouter);
app.use("/api/v1/depth", depthRouter);
app.use("/api/v1/trades", tradesRouter);
app.use("/api/v1/klines", klineRouter);
app.use("/api/v1/tickers", tickersRouter);
app.use("/api/v1/balance", balanceRouter);
app.use("/api/v1/onramp", onrampRouter);
app.use("/api/v1/withdraw", withdrawRouter);


app.listen(3000, () => {
    console.log("Server is running on port 3000");
    console.log("Auth endpoints: POST /api/v1/auth/register, POST /api/v1/auth/login");
});