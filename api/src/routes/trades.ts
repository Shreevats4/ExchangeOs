import { Router } from "express";

export const tradesRouter = Router();

tradesRouter.get("/", async (req, res) => {
    const { market } = req.query;
    // Return an empty array for now (trades will be populated when orders are matched)
    res.json([]);
})
