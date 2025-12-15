import { Router } from "express";
import { RedisManager } from "../RedisManager";

export const authRouter = Router();

// In-memory user store (for demo - use database in production)
const users = new Map<string, {
    id: string;
    email: string;
    password: string;
    name: string;
    phone?: string;
    createdAt: Date;
}>();

// Pre-populate with demo users
users.set("demo@example.com", {
    id: "1",
    email: "demo@example.com",
    password: "password123",
    name: "Demo User",
    createdAt: new Date()
});

users.set("trader@example.com", {
    id: "2",
    email: "trader@example.com", 
    password: "password123",
    name: "Pro Trader",
    createdAt: new Date()
});

// Simple token generator (use JWT in production)
function generateToken(userId: string): string {
    return `token_${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

// User registration
authRouter.post("/register", async (req, res) => {
    try {
        const { email, password, name, phone } = req.body;

        // Validation
        if (!email || !password || !name) {
            return res.status(400).json({
                success: false,
                error: "Email, password, and name are required"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                error: "Password must be at least 6 characters"
            });
        }

        // Check if user exists
        if (users.has(email.toLowerCase())) {
            return res.status(400).json({
                success: false,
                error: "Email already registered"
            });
        }

        // Generate user ID
        const userId = `user_${Date.now()}`;

        // Create user
        const newUser = {
            id: userId,
            email: email.toLowerCase(),
            password: password, // In production, hash this!
            name,
            phone,
            createdAt: new Date()
        };
        
        users.set(email.toLowerCase(), newUser);

        // Also register with engine to get balance
        try {
            await RedisManager.getInstance().sendAndAwait({
                type: "ON_RAMP" as any,
                data: {
                    userId: userId,
                    amount: "100000", // Give new users ₹1 Lakh to start
                    txnId: `welcome_bonus_${userId}`
                }
            } as any);
        } catch (e) {
            console.log("Could not set initial balance:", e);
        }

        // Generate token
        const token = generateToken(userId);

        res.status(201).json({
            success: true,
            message: "Registration successful! You received ₹1,00,000 welcome bonus.",
            user: {
                id: userId,
                email: email.toLowerCase(),
                name,
                role: "user",
                kycStatus: "pending"
            },
            token
        });

    } catch (error: any) {
        console.error("Registration error:", error);
        res.status(500).json({
            success: false,
            error: "Registration failed. Please try again."
        });
    }
});

// User login
authRouter.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: "Email and password are required"
            });
        }

        // Find user
        const user = users.get(email.toLowerCase());

        if (!user) {
            return res.status(401).json({
                success: false,
                error: "Invalid email or password"
            });
        }

        // Verify password (simple comparison - use bcrypt in production)
        if (user.password !== password) {
            return res.status(401).json({
                success: false,
                error: "Invalid email or password"
            });
        }

        // Generate token
        const token = generateToken(user.id);

        res.json({
            success: true,
            message: "Login successful",
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: "user",
                kycStatus: "verified"
            },
            token
        });

    } catch (error: any) {
        console.error("Login error:", error);
        res.status(500).json({
            success: false,
            error: "Login failed. Please try again."
        });
    }
});

// Get all registered users (for demo)
authRouter.get("/users", async (req, res) => {
    const userList = Array.from(users.values()).map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        createdAt: u.createdAt
    }));
    res.json({ users: userList });
});

// Get current user profile
authRouter.get("/me", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                error: "Authentication required"
            });
        }

        // In production, decode JWT and get user from database
        // For now, return demo user
        res.json({
            success: true,
            user: {
                id: "1",
                email: "demo@example.com",
                name: "Demo User",
                role: "user",
                kycStatus: "verified"
            }
        });

    } catch (error: any) {
        console.error("Get profile error:", error);
        res.status(500).json({
            success: false,
            error: "Failed to get profile"
        });
    }
});

