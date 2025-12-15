# 📊 Exchange Orderbook System

A production-grade order matching engine built with Node.js, Redis, TimescaleDB, and WebSockets.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Component Deep-Dive](#component-deep-dive)
3. [Data Flow](#data-flow)
4. [Key Technical Decisions](#key-technical-decisions)
5. [Implementation Details](#implementation-details)
6. [Testing](#testing)
7. [Setup & Running](#setup--running)
8. [API Reference](#api-reference)
9. [Interview Questions](#interview-questions)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js)                              │
│                            http://localhost:3002                             │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│   │  Chart   │  │ Orderbook│  │  Ticker  │  │  Orders  │  │ Balances │      │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
└────────┼─────────────┼─────────────┼─────────────┼─────────────┼────────────┘
         │ HTTP        │ WebSocket   │ HTTP        │ HTTP        │ HTTP
         ▼             ▼             ▼             ▼             ▼
┌─────────────────┐  ┌─────────────────┐
│   API Server    │  │  WebSocket      │
│  (Express.js)   │  │    Server       │
│  Port: 3000     │  │  Port: 3001     │
└────────┬────────┘  └────────┬────────┘
         │                    │
         │ Redis Pub/Sub      │ Redis Subscribe
         ▼                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                              REDIS (Port 6379)                             │
│                                                                            │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                │
│   │  "messages"  │    │"db_processor"│    │  Pub/Sub     │                │
│   │   (Queue)    │    │   (Queue)    │    │  Channels    │                │
│   │  API → Engine│    │Engine → DB   │    │depth@, trade@│                │
│   └──────────────┘    └──────────────┘    └──────────────┘                │
└───────────────────────────────────────────────────────────────────────────┘
         │                    │
         │ rPop               │ rPop
         ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ENGINE (Order Matching)                             │
│                                                                              │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│   │  Orderbook  │  │   Balances  │  │   Matching  │  │  Snapshot   │       │
│   │  bids/asks  │  │   (Map)     │  │    Logic    │  │   (3 sec)   │       │
│   └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
                                 │
                                 │ lPush to "db_processor"
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DB Processor                                       │
│                  (Consumes from Redis, writes to DB)                        │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TimescaleDB (PostgreSQL)                             │
│                                                                              │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│   │   orders    │  │   trades    │  │ tata_prices │  │  klines_*   │       │
│   └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Deep-Dive

### 1. API Server (`api/`)

**Purpose:** HTTP gateway that receives client requests and forwards them to the Engine via Redis.

**Key Logic:**
```typescript
// api/src/RedisManager.ts
public sendAndAwait(message: MessageToEngine) {
    return new Promise((resolve) => {
        const clientId = this.getRandomClientId();
        
        // 1. Subscribe to a unique response channel FIRST
        this.client.subscribe(clientId, (response) => {
            this.client.unsubscribe(clientId);
            resolve(JSON.parse(response));
        });
        
        // 2. Push order to queue with clientId attached
        this.publisher.lPush("messages", JSON.stringify({ 
            clientId, 
            message 
        }));
    });
}
```

**Why this pattern?**
- Request-Response over async queue
- API doesn't wait for DB write (fast confirmation)
- Engine responds directly to the waiting API via Pub/Sub

---

### 2. Matching Engine (`engine/`)

**Purpose:** The heart of the exchange. Matches buy/sell orders, manages balances, publishes events.

#### Order Interface (Using Strings for Precision)
```typescript
// engine/src/trade/Orderbook.ts
interface Order {
    price: string;      // "1000.50" - NOT number!
    quantity: string;   // "10.25"   - NOT number!
    orderId: string;
    filled: string;     // "0" initially
    side: "buy" | "sell";
    userId: string;
}
```

#### Orderbook Data Structure

The orderbook maintains **sorted arrays** for efficient price-time priority matching:

```typescript
class Orderbook {
    bids: Order[];  // Sorted: Price HIGH → LOW (best bid at index 0)
    asks: Order[];  // Sorted: Price LOW → HIGH (best ask at index 0)
}
```

**Why sorted arrays?**
- Best price is always at index 0 (O(1) access)
- Price-time priority is maintained automatically
- Binary search for O(log n) insertion

#### Binary Search Insertion

New orders are inserted at the correct position to maintain sort order:

```typescript
private findInsertIndex(arr: Order[], price: string, side: "buy" | "sell"): number {
    let low = 0, high = arr.length;
    
    while (low < high) {
        const mid = (low + high) >>> 1;
        
        // Bids (Desc): higher price = lower index
        // Asks (Asc): lower price = lower index
        const shouldGoLeft = side === "buy"
            ? isGreater(price, arr[mid].price)
            : isLess(price, arr[mid].price);

        if (shouldGoLeft) {
            high = mid;
        } else {
            low = mid + 1;
        }
    }
    return low;  // Insert position
}
```

**Time Complexity:**
- Insertion: O(log n) search + O(n) splice = O(n)
- Finding best price: O(1)

#### Generic Matching Engine

A single `matchOrder()` method handles both buy and sell orders:

```typescript
private matchOrder(
    incomingOrder: Order, 
    book: Order[],        // asks for buy, bids for sell
    side: "buy" | "sell"
): { fills: Fill[], executedQty: string } {
    const fills: Fill[] = [];
    let executedQty = "0";
    let qtyToFill = incomingOrder.quantity;

    let i = 0;
    while (i < book.length && isGreater(qtyToFill, "0")) {
        const makerOrder = book[i];

        // Check price crossing
        const pricesCross = side === "buy"
            ? isLessOrEqual(makerOrder.price, incomingOrder.price)   // Ask <= Bid
            : isGreaterOrEqual(makerOrder.price, incomingOrder.price); // Bid >= Ask

        if (!pricesCross) break;  // No more matchable orders

        // Skip self-trades
        if (makerOrder.userId === incomingOrder.userId) {
            i++;
            continue;
        }

        // Execute fill
        const fillQty = min(qtyToFill, remainingMaker);
        executedQty = add(executedQty, fillQty);
        makerOrder.filled = add(makerOrder.filled, fillQty);

        fills.push({ price: makerOrder.price, qty: fillQty, ... });

        // Remove fully filled orders
        if (isEqual(makerOrder.filled, makerOrder.quantity)) {
            book.splice(i, 1);  // Remove, don't increment i
        } else {
            i++;
        }
    }

    return { fills, executedQty };
}
```

#### Balance Management
```typescript
// engine/src/trade/Engine.ts
interface UserBalance {
    [asset: string]: {
        available: string;  // Can be used for new orders
        locked: string;     // Tied up in open orders
    };
}

// Before placing order: Lock funds
checkAndLockFunds(side, userId, price, quantity) {
    if (side === "buy") {
        const required = multiply(quantity, price);
        
        if (isLess(available, required)) {
            throw new Error("Insufficient funds");
        }
        
        // Move from available → locked
        balance.available = subtract(balance.available, required);
        balance.locked = add(balance.locked, required);
    }
}
```

---

### 3. Decimal Precision (`engine/src/utils/decimal.ts`)

**Why:** JavaScript's `Number` type uses IEEE 754 floating-point, causing errors like:
```javascript
0.1 + 0.2 === 0.30000000000000004  // true 😱
```

**Solution:** Use `decimal.js` library with string I/O:
```typescript
import Decimal from "decimal.js";

Decimal.set({ 
    precision: 30,              // Handle up to 30 significant digits
    rounding: Decimal.ROUND_DOWN // Never round in user's favor
});

export function add(a: string, b: string): string {
    return new Decimal(a).plus(b).toString();
}

export function multiply(a: string, b: string): string {
    return new Decimal(a).times(b).toString();
}

export function isGreaterOrEqual(a: string, b: string): boolean {
    return new Decimal(a).greaterThanOrEqualTo(b);
}
```

**All financial values flow as STRINGS through the entire system.**

---

### 4. Self-Trade Prevention (`engine/src/trade/Orderbook.ts`)

**Problem:** User places both buy and sell orders, then trades with themselves (wash trading).

**Solution:** Three industry-standard modes:

```typescript
type SelfTradePreventionMode = "CANCEL_NEWEST" | "CANCEL_OLDEST" | "CANCEL_BOTH";

addOrder(order: Order): AddOrderResult {
    const { wouldSelfTrade, conflictingOrders } = this.wouldSelfTrade(order);
    
    if (wouldSelfTrade) {
        switch (this.stpMode) {
            case "CANCEL_NEWEST":
                // Reject the incoming order entirely
                return { status: "REJECTED", rejectionReason: "SELF_TRADE_PREVENTION" };
            
            case "CANCEL_OLDEST":
                // Cancel resting orders, process incoming
                conflictingOrders.forEach(o => this.cancelOrder(o));
                return this.processOrder(order);
            
            case "CANCEL_BOTH":
                // Cancel all conflicting orders
                conflictingOrders.forEach(o => this.cancelOrder(o));
                return { status: "REJECTED", cancelledOrders: [...] };
        }
    }
    
    return this.processOrder(order);
}
```

---

### 5. Snapshotting (`engine/src/trade/Engine.ts`)

**Problem:** Engine state is in-memory. If it crashes, all orders are lost.

**Solution:** Periodic snapshots to disk:
```typescript
constructor() {
    // On startup: Load snapshot if exists
    if (process.env.WITH_SNAPSHOT) {
        const snapshot = fs.readFileSync("./snapshot.json");
        const parsed = JSON.parse(snapshot);
        this.orderbooks = parsed.orderbooks.map(o => new Orderbook(...));
        this.balances = new Map(parsed.balances);
    }
    
    // Every 3 seconds: Save snapshot
    setInterval(() => this.saveSnapshot(), 3000);
}

saveSnapshot() {
    fs.writeFileSync("./snapshot.json", JSON.stringify({
        orderbooks: this.orderbooks.map(o => o.getSnapshot()),
        balances: Array.from(this.balances.entries())
    }));
}
```

**Start with snapshot:** `$env:WITH_SNAPSHOT="true"; npm run dev`

---

### 6. WebSocket Server (`ws/`)

**Purpose:** Real-time updates to frontend (orderbook depth, trades).

**Architecture:**
```typescript
// ws/src/SubscriptionManager.ts
// Listens to Redis Pub/Sub, broadcasts to subscribed WebSocket clients

class SubscriptionManager {
    private subscriptions: Map<string, WebSocket[]> = new Map();
    
    constructor() {
        // Subscribe to Redis channels
        this.redisClient.pSubscribe("depth@*", (message, channel) => {
            // Find all WebSocket clients subscribed to this channel
            const clients = this.subscriptions.get(channel);
            clients?.forEach(ws => ws.send(message));
        });
    }
}
```

**Client subscribes:**
```javascript
ws.send(JSON.stringify({
    method: "SUBSCRIBE",
    params: ["depth@TATA_INR", "trade@TATA_INR"]
}));
```

---

### 7. DB Processor (`db/`)

**Purpose:** Consumes events from Redis queue, persists to PostgreSQL/TimescaleDB.

**Why separate from Engine?**
- Database writes are slow (5-50ms)
- Engine must be fast (<1ms per order)
- Decoupling allows engine to continue matching while DB catches up

```typescript
// db/src/index.ts
async function main() {
    while (true) {
        // Pop from Redis queue (blocks if empty)
        const message = await redisClient.rPop("db_processor");
        
        if (message) {
            const data = JSON.parse(message);
            
            if (data.type === "TRADE_ADDED") {
                await pgClient.query(
                    "INSERT INTO trades VALUES ($1, $2, $3, ...)",
                    [data.id, data.price, data.quantity, ...]
                );
            }
            
            if (data.type === "ORDER_UPDATE") {
                await pgClient.query(
                    "INSERT INTO orders ... ON CONFLICT DO UPDATE ...",
                    [data.orderId, data.executedQty, ...]
                );
            }
        }
    }
}
```

---

### 8. TimescaleDB

**Why not standard PostgreSQL?**
- Automatic time-based partitioning (hypertables)
- `time_bucket()` function for candlestick aggregation
- 10-100x faster for time-range queries

**Candlestick (Kline) generation:**
```sql
CREATE MATERIALIZED VIEW klines_1h AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    first(price, time) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, time) AS close,
    sum(volume) AS volume
FROM tata_prices
GROUP BY bucket;
```

---

## Data Flow

### Placing an Order

```
1. User clicks "Buy 10 TATA at ₹1000"
   │
2. Frontend → POST /api/v1/order
   │
3. API generates unique clientId, subscribes to Redis channel
   │
4. API → lPush("messages", { clientId, order })
   │
5. Engine → rPop("messages")
   │
6. Engine: checkAndLockFunds() → Match order → Update balances
   │
7. Engine → publish(clientId, { orderId, executedQty, fills })
   │
8. API receives response → Returns to Frontend
   │
9. Engine → lPush("db_processor", { type: "TRADE_ADDED", ... })
   │
10. Engine → publish("depth@TATA_INR", updatedDepth)
    │
11. WebSocket Server → broadcasts to subscribed clients
    │
12. Frontend updates orderbook UI in real-time
```

### Key Insight
**User gets confirmation at step 8** (when Engine processes), **NOT** when database writes complete (step 9+). This is why we can confirm orders in <1ms.

---

## Key Technical Decisions

### 1. Why Redis Queue (not Kafka)?

| Aspect | Redis | Kafka |
|--------|-------|-------|
| Latency | Microseconds | Milliseconds |
| Durability | Optional (AOF) | Built-in |
| Replayability | ❌ Messages deleted on read | ✅ Consumer offsets |
| Complexity | Low | High |

**Choice:** Redis for hot path (low latency), consider Kafka for audit logs.

### 2. Why Single-Threaded Engine?

An orderbook for a single market MUST be single-threaded:
- Matching is stateful (bids/asks arrays)
- Concurrent access = race conditions
- Node.js event loop = natural mutex

**Scaling:** Shard by market symbol (TATA on Engine1, BTC on Engine2).

### 3. Why In-Memory Balances?

Database queries are too slow for real-time trading:
```
Memory check:  ~1 microsecond
Database query: ~5-50 milliseconds
```

If you query DB for every order, a user could submit 1000 orders before the first DB response, causing massive overdraft.

### 4. Why Strings for All Financial Values?

JavaScript `Number.MAX_SAFE_INTEGER = 9,007,199,254,740,991`

Crypto quantities can have 18 decimal places:
```
0.000000000000000001 ETH = 1 wei
```

Storing as `Number` loses precision. Storing as `string` preserves exact digits.

---

## Implementation Details

### Balance Management & Testing

**Critical Requirement:** Every trade must correctly transfer assets between users without creating or destroying money.

#### Balance Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        ORDER LIFECYCLE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. PLACE ORDER                                                 │
│     └─→ checkAndLockFunds()                                     │
│         BUY:  INR.available -= qty*price, INR.locked += qty*price│
│         SELL: TATA.available -= qty, TATA.locked += qty         │
│                                                                 │
│  2. MATCH & FILL                                                │
│     └─→ updateBalance()                                         │
│         BUYER:  INR.locked -= fillValue, TATA.available += qty  │
│         SELLER: TATA.locked -= qty, INR.available += fillValue  │
│                                                                 │
│  3. CANCEL (unfilled portion)                                   │
│     └─→ unlockFunds()                                           │
│         BUY:  INR.locked -= remaining*price, INR.available += ...│
│         SELL: TATA.locked -= remaining, TATA.available += ...   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Balance Test Suite (`engine/src/tests/balance.test.ts`)

We have comprehensive tests to verify balance correctness:

| Test | What It Verifies |
|------|------------------|
| **BUY Full Fill** | Buyer pays INR, receives TATA. Seller receives INR, gives TATA. |
| **SELL Full Fill** | Seller gives TATA, receives INR. Buyer pays INR, receives TATA. |
| **Partial Fill** | Only filled portion is transferred, rest stays locked. |
| **Multiple Fills** | Single order matching multiple counterparties. |
| **Insufficient Funds** | Orders rejected if user can't afford. |
| **Conservation** | Total assets remain constant (no money created/destroyed). |

**Example Test Output:**
```
=== BUY Order Full Fill ===
User 1 (Buyer):  { INR: { available: '9000',  locked: '0' }, TATA: { available: '110', locked: '0' } }
User 2 (Seller): { INR: { available: '11000', locked: '0' }, TATA: { available: '90',  locked: '0' } }

=== Conservation Check ===
Total INR:  20000 → 20000 ✅
Total TATA: 200 → 200 ✅
```

**Run the tests:**
```bash
cd engine
npm test
```

---

### Depth Caching

**Problem:** Computing orderbook depth on every request is O(n).

**Solution:** Maintain cached depth maps, updated incrementally:
```typescript
class Orderbook {
    private bidsDepth: Map<string, string> = new Map();  // price → total qty
    private asksDepth: Map<string, string> = new Map();
    
    // O(1) update when order is added/filled/cancelled
    private updateDepth(side: "buy" | "sell", price: string, delta: string) {
        const map = side === "buy" ? this.bidsDepth : this.asksDepth;
        const current = map.get(price) || "0";
        const newValue = add(current, delta);
        
        if (isLessOrEqual(newValue, "0")) {
            map.delete(price);
        } else {
            map.set(price, newValue);
        }
    }
    
    // O(k) where k = number of price levels
    getDepth(): { bids: [string, string][], asks: [string, string][] } {
        return {
            bids: Array.from(this.bidsDepth.entries()),
            asks: Array.from(this.asksDepth.entries())
        };
    }
}
```

---

## Testing

The engine has **30 comprehensive tests** covering all critical functionality.

### Run All Tests
```bash
cd engine
npm test
```

### Test Coverage

| Test File | Tests | What It Covers |
|-----------|-------|----------------|
| `orderbook.test.ts` | 22 | Matching, fills, partial fills, self-trade prevention |
| `balance.test.ts` | 7 | Balance updates, conservation, insufficient funds |
| `engine.test.ts` | 1 | WebSocket depth update publishing |

### Key Test Scenarios

**Orderbook Tests:**
- ✅ Buy order matches with ask
- ✅ Sell order matches with bid
- ✅ Partial fills work correctly
- ✅ Multiple fills aggregate properly
- ✅ Self-trade prevention (CANCEL_NEWEST rejects incoming)
- ✅ Orders sorted by price-time priority
- ✅ Depth cache updates correctly

**Balance Tests:**
- ✅ BUY: Buyer pays INR, receives TATA
- ✅ SELL: Seller receives INR, gives TATA
- ✅ Partial fill: Only filled portion transfers
- ✅ Multiple fills: Aggregates from multiple sellers
- ✅ Insufficient funds: Order rejected
- ✅ Conservation: Total assets unchanged after trade

### Sample Test Output
```
 ✓ src/tests/engine.test.ts  (1 test) 25ms
 ✓ src/tests/balance.test.ts  (7 tests) 24ms
 ✓ src/tests/orderbook.test.ts  (22 tests) 28ms

 Test Files  3 passed (3)
      Tests  30 passed (30)
```

---

## Setup & Running

### Prerequisites
- Node.js v18+
- Docker Desktop

### 1. Start Infrastructure
```bash
cd docker
docker-compose up -d
# Starts Redis (6379) + TimescaleDB (5432)
```

### 2. Create Database Tables
```bash
docker exec -it timescaledb psql -U your_user -d my_database -c "
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(50) PRIMARY KEY,
    market VARCHAR(20),
    price DECIMAL(18,8),
    quantity DECIMAL(18,8),
    side VARCHAR(10),
    executed_qty DECIMAL(18,8) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trades (
    id VARCHAR(50) PRIMARY KEY,
    market VARCHAR(20),
    price DECIMAL(18,8),
    quantity DECIMAL(18,8),
    is_buyer_maker BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tata_prices (
    time TIMESTAMPTZ NOT NULL,
    price DECIMAL(18,8),
    volume DECIMAL(18,8),
    currency_code VARCHAR(20)
);
"
```

### 3. Install Dependencies
```bash
cd api && npm install
cd ../engine && npm install
cd ../ws && npm install
cd ../db && npm install
cd ../frontend && npm install
cd ../mm && npm install
```

### 4. Start Services (6 terminals)
```bash
# Terminal 1 - Engine
cd engine
$env:WITH_SNAPSHOT="true"; npm run dev

# Terminal 2 - API
cd api
npm run dev

# Terminal 3 - WebSocket
cd ws
npm run dev

# Terminal 4 - DB Processor
cd db
npm run dev

# Terminal 5 - Frontend
cd frontend
npm run dev -- -p 3002

# Terminal 6 - Market Maker (optional)
cd mm
npm run dev
```

### 5. Open App
Navigate to: **http://localhost:3002/trade/TATA_INR**

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/order` | POST | Place order `{ market, price, quantity, side, userId }` |
| `/api/v1/order` | DELETE | Cancel order `{ orderId, market }` |
| `/api/v1/order/open` | GET | Get open orders `?userId=...&market=...` |
| `/api/v1/depth` | GET | Get orderbook `?symbol=TATA_INR` |
| `/api/v1/trades` | GET | Get recent trades `?symbol=TATA_INR` |
| `/api/v1/klines` | GET | Get candlesticks `?symbol=...&interval=1h&startTime=...` |
| `/api/v1/balance` | GET | Get balances `?userId=...` |

### WebSocket Subscriptions
```javascript
// Connect
const ws = new WebSocket("ws://localhost:3001");

// Subscribe to orderbook updates
ws.send(JSON.stringify({
    method: "SUBSCRIBE",
    params: ["depth@TATA_INR"]
}));

// Subscribe to trades
ws.send(JSON.stringify({
    method: "SUBSCRIBE",
    params: ["trade@TATA_INR"]
}));

// Receive updates
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log(data.stream, data.data);
};
```

---

## Interview Questions

### Architecture

**Q: Why Redis instead of Kafka?**
> Latency. Redis gives microsecond latency for the hot path. Kafka adds milliseconds. For a trading engine, we confirm orders based on Engine processing, not DB writes. However, Kafka is better for audit logs where durability matters more than speed.

**Q: How do you scale a single-threaded orderbook?**
> Shard by symbol. Each market (TATA_INR, BTC_USDT) gets its own Engine instance. A load balancer routes orders by market hash. You cannot parallelize within a single orderbook because matching is stateful.

**Q: Where does the user get order confirmation?**
> When the Engine processes the order (in-memory), NOT when the database writes complete. DB writes are asynchronous. This is why we can confirm in <1ms.

### Implementation

**Q: How did you handle floating-point precision?**
> I used `decimal.js` with 30-digit precision. All financial values (prices, quantities, balances) are stored and transmitted as strings, never JavaScript Numbers. This prevents IEEE 754 errors like `0.1 + 0.2 = 0.30000000000000004`.

**Q: What is the time complexity of your matching?**
> The orderbook is kept sorted (bids descending, asks ascending). Finding the best price is O(1) since it's at index 0. Matching iterates from best price until no more crossings, which is O(m) where m = matched orders. Insertion uses binary search O(log n) + splice O(n) = O(n). For true O(log n) everything, we'd need a Red-Black tree or skip list.

**Q: How do you ensure balance correctness after trades?**
> We have a comprehensive test suite (`balance.test.ts`) that verifies:
> 1. **Conservation**: Total assets before trade = Total assets after trade
> 2. **Correct flow**: Buyer loses INR, gains TATA. Seller loses TATA, gains INR.
> 3. **Partial fills**: Only filled portion transfers, unfilled stays locked.
> 4. **Multiple fills**: One order matching multiple counterparties aggregates correctly.
> All 30 tests pass, including 7 specific balance tests.

**Q: How do you handle self-trade prevention?**
> I check before matching if the incoming order would match against the same user's resting orders. Three modes: CANCEL_NEWEST (reject incoming), CANCEL_OLDEST (cancel resting), CANCEL_BOTH.

### Failure Scenarios

**Q: What if the Engine crashes?**
> It loads the last snapshot (saved every 3 seconds). Orders in the last 3 seconds may be lost. Production fix: Write-Ahead Log to Redis before processing, then replay on startup.

**Q: What if Redis runs out of memory?**
> Set `maxmemory-policy noeviction`. Engine's writes will fail, but no data loss. Alert ops, scale up or fix the DB processor.

**Q: What if cancel arrives after order is filled?**
> The Engine is the source of truth. If the order doesn't exist in the orderbook (already filled), cancel returns "Order not found". No race condition because Engine is single-threaded.

### Security

**Q: How do you prevent overdraft (spending more than available)?**
> Pre-trade balance check in-memory. Before matching, we verify `available >= required` and atomically move funds to `locked`. Since Engine is single-threaded, no race condition is possible.

**Q: Can users spy on others' trades via WebSocket?**
> Currently: YES, this is a vulnerability. Fix: JWT authentication on WebSocket connection. Verify userId matches the requested subscription channel.

---

## Project Structure

```
week-2/
├── api/                    # HTTP API Server
│   └── src/
│       ├── index.ts        # Express server
│       ├── RedisManager.ts # Request-response over Redis
│       └── routes/         # Endpoint handlers
│
├── engine/                 # Order Matching Engine
│   └── src/
│       ├── index.ts        # Queue consumer
│       ├── RedisManager.ts # Event publisher
│       ├── trade/
│       │   ├── Engine.ts   # Balance management
│       │   └── Orderbook.ts # Matching logic (sorted, binary search)
│       ├── tests/
│       │   ├── orderbook.test.ts  # 22 matching tests
│       │   ├── balance.test.ts    # 7 balance correctness tests
│       │   └── engine.test.ts     # Integration tests
│       └── utils/
│           └── decimal.ts  # decimal.js wrapper (30 precision)
│
├── ws/                     # WebSocket Server
│   └── src/
│       ├── index.ts        # WS server
│       ├── User.ts         # Client connection
│       └── SubscriptionManager.ts # Pub/Sub bridge
│
├── db/                     # Database Processor
│   └── src/
│       └── index.ts        # Queue consumer → PostgreSQL
│
├── frontend/               # Next.js UI
│   └── app/
│       ├── components/     # React components
│       └── utils/          # API/WebSocket clients
│
├── mm/                     # Market Maker Bot
│   └── src/
│       └── index.ts        # Automated trading
│
└── docker/
    └── docker-compose.yml  # Redis + TimescaleDB
```

---

## What's Implemented vs Not

| Feature | Status | Notes |
|---------|--------|-------|
| Redis Queue (lPush/rPop) | ✅ | Engine ↔ API ↔ DB Processor |
| Async order confirmation | ✅ | Confirm at Engine, not DB |
| Self-Trade Prevention (3 modes) | ✅ | CANCEL_NEWEST/OLDEST/BOTH |
| Snapshotting (3 sec) | ✅ | `snapshot.json` auto-save |
| Pre-trade balance check | ✅ | In-memory atomic check |
| Cached depth computation | ✅ | `bidsDepth/asksDepth` Maps |
| **decimal.js (30 precision)** | ✅ | All values as strings |
| TimescaleDB persistence | ✅ | orders, trades, tata_prices |
| WebSocket real-time updates | ✅ | depth@, trade@, userTrades@ |
| **Sorted Orderbook (Price-Time)** | ✅ | Binary search insertion |
| **Generic matchOrder()** | ✅ | Handles buy/sell uniformly |
| **Balance Tests (7 scenarios)** | ✅ | Conservation verified |
| JWT WebSocket auth | ❌ | Security gap |
| Write-Ahead Log | ❌ | Risk: data loss on crash |
| Idempotency keys | ❌ | Duplicate orders possible |
| Market Orders | ❌ | LIMIT only |
| Red-Black Tree orderbook | ❌ | O(n) arrays, not O(log n) |

---

## License

MIT - Use for learning and building!
