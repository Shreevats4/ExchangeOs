import { Router } from "express";
import { RedisManager } from "../RedisManager";
import { WITHDRAW } from "../types";

export const withdrawRouter = Router();

// Response types for withdraw
interface WithdrawSuccessPayload {
    userId: string;
    amount: number;
    newBalance: number;
    txnId: string;
}

interface WithdrawFailedPayload {
    error: string;
}

// POST /api/v1/withdraw
// Body: { userId: string, amount: number, bankAccount?: string }
withdrawRouter.post("/", async (req, res) => {
    try {
        const { userId, amount, bankAccount } = req.body;

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

        const txnId = `withdraw_${Date.now()}`;

        // Process withdrawal (deduct from balance)
        const response = await RedisManager.getInstance().sendAndAwait({
            type: WITHDRAW,
            data: {
                userId,
                amount: amount.toString(),
                bankAccount: bankAccount || "XXXX-XXXX-1234",
                txnId,
            },
        } as any); // Type assertion for new message type

        if (response.type === "WITHDRAW_FAILED") {
            const payload = response.payload as WithdrawFailedPayload;
            return res.status(400).json({
                success: false,
                error: payload.error
            });
        }

        const payload = response.payload as WithdrawSuccessPayload;
        res.json({
            success: true,
            message: `Withdrawal of ₹${amount} initiated`,
            estimatedTime: "1-2 business days",
            transactionId: txnId,
            newBalance: payload.newBalance,
        });
    } catch (error) {
        console.error("Error processing withdrawal:", error);
        res.status(500).json({ error: "Failed to process withdrawal" });
    }
});

