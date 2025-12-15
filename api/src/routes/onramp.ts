import { Router } from "express";
import { RedisManager } from "../RedisManager";
import { ON_RAMP } from "../types";

export const onrampRouter = Router();

// POST /api/v1/onramp
// Body: { userId: string, amount: number, txnId?: string }
onrampRouter.post("/", async (req, res) => {
    try {
        const { userId, amount, txnId } = req.body;

        if (!userId || !amount) {
            return res.status(400).json({ 
                error: "userId and amount are required" 
            });
        }

        if (amount <= 0) {
            return res.status(400).json({ 
                error: "Amount must be positive" 
            });
        }

        const response = await RedisManager.getInstance().sendAndAwait({
            type: ON_RAMP,
            data: {
                userId,
                amount: amount.toString(),
                txnId: txnId || `txn_${Date.now()}`,
            },
        });

        res.json({
            success: true,
            message: `Added ₹${amount} to account`,
            ...response.payload,
        });
    } catch (error) {
        console.error("Error processing on-ramp:", error);
        res.status(500).json({ error: "Failed to process on-ramp" });
    }
});

