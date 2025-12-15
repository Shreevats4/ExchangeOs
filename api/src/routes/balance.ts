import { Router } from "express";
import { RedisManager } from "../RedisManager";

export const balanceRouter = Router();

// GET /api/v1/balance?userId=1
balanceRouter.get("/", async (req, res) => {
    try {
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({ error: "userId is required" });
        }

        // Use type assertion for the message since GET_BALANCE is a new message type
        const response = await RedisManager.getInstance().sendAndAwait({
            type: "GET_BALANCE" as any,
            data: {
                userId: userId as string,
            },
        } as any);

        res.json(response.payload);
    } catch (error) {
        console.error("Error fetching balance:", error);
        res.status(500).json({ error: "Failed to fetch balance" });
    }
});

