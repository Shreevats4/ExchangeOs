# 🧪 Trading Testing Guide

## Quick Start: Reset Everything

### Step 1: Delete the old snapshot (to reset balances)
```powershell
cd week-30-orderbook-1/week-2/engine
Remove-Item snapshot.json -ErrorAction SilentlyContinue
```

### Step 2: Restart Engine WITHOUT snapshot
```powershell
npm run dev
```

Now each user starts with:
- **₹10,00,000 INR** (10 Lakh)
- **1,000 TATA shares**

---

## 📮 Postman API Testing

### Base URL: `http://localhost:3000/api/v1`

---

### 1️⃣ Check Balance
```
GET http://localhost:3000/api/v1/balance?userId=1
```

**Expected Response:**
```json
{
  "INR": { "available": 1000000, "locked": 0 },
  "TATA": { "available": 1000, "locked": 0 }
}
```

---

### 2️⃣ Place a BUY Order
```
POST http://localhost:3000/api/v1/order
Content-Type: application/json

{
  "market": "TATA_INR",
  "price": "1000",
  "quantity": "10",
  "side": "buy",
  "userId": "1"
}
```

**Expected Response:**
```json
{
  "orderId": "abc123xyz",
  "executedQty": 0,
  "fills": []
}
```

**What happens:**
- If no matching SELL order exists → Order goes to orderbook
- INR balance: `available` decreases by 10,000 (10 × ₹1000), `locked` increases by 10,000

**Check balance again:**
```json
{
  "INR": { "available": 990000, "locked": 10000 },
  "TATA": { "available": 1000, "locked": 0 }
}
```

---

### 3️⃣ Place a SELL Order (to match the BUY)
User 2 sells 10 TATA at ₹1000 (matches User 1's buy order):

```
POST http://localhost:3000/api/v1/order
Content-Type: application/json

{
  "market": "TATA_INR",
  "price": "1000",
  "quantity": "10",
  "side": "sell",
  "userId": "2"
}
```

**Expected Response (Trade executed!):**
```json
{
  "orderId": "def456uvw",
  "executedQty": 10,
  "fills": [
    {
      "price": "1000",
      "qty": 10,
      "tradeId": 1
    }
  ]
}
```

**What happens:**
- Trade executes at ₹1000 per share
- User 1: Gets 10 TATA shares, loses ₹10,000
- User 2: Gets ₹10,000, loses 10 TATA shares

**Check User 1 balance:**
```json
{
  "INR": { "available": 990000, "locked": 0 },
  "TATA": { "available": 1010, "locked": 0 }
}
```

**Check User 2 balance:**
```json
{
  "INR": { "available": 1010000, "locked": 0 },
  "TATA": { "available": 990, "locked": 0 }
}
```

---

### 4️⃣ Deposit Money
```
POST http://localhost:3000/api/v1/onramp
Content-Type: application/json

{
  "userId": "1",
  "amount": 50000
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Added ₹50000 to account"
}
```

**Check balance:**
```json
{
  "INR": { "available": 1040000, "locked": 0 },
  "TATA": { "available": 1010, "locked": 0 }
}
```

---

### 5️⃣ Withdraw Money
```
POST http://localhost:3000/api/v1/withdraw
Content-Type: application/json

{
  "userId": "1",
  "amount": 25000
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Withdrawal of ₹25000 initiated",
  "estimatedTime": "1-2 business days",
  "transactionId": "withdraw_1702654321000",
  "newBalance": 1015000
}
```

---

### 6️⃣ Get Open Orders
```
GET http://localhost:3000/api/v1/order/open?userId=1&market=TATA_INR
```

---

### 7️⃣ Cancel Order
```
DELETE http://localhost:3000/api/v1/order
Content-Type: application/json

{
  "orderId": "abc123xyz",
  "market": "TATA_INR"
}
```

---

### 8️⃣ Get Orderbook Depth
```
GET http://localhost:3000/api/v1/depth?symbol=TATA_INR
```

**Response shows all bids and asks:**
```json
{
  "bids": [["999", "50"], ["998", "100"]],
  "asks": [["1001", "30"], ["1002", "80"]]
}
```

---

## 🖥️ Frontend Testing

### URL: `http://localhost:3002/trade/TATA_INR`

### How to Buy:
1. Enter **Price**: 1000
2. Enter **Quantity**: 10
3. Click **Buy**
4. Check "Open Orders" panel at bottom
5. If matched, order disappears and balance updates

### How to Sell:
1. Switch to **Sell** tab (red button)
2. Enter **Price**: 1000
3. Enter **Quantity**: 5
4. Click **Sell**

### Check Your Balance:
1. Go to **http://localhost:3002/funds**
2. See your INR and TATA holdings
3. Test Deposit/Withdraw

---

## 🔄 Complete Trading Flow Example

### Scenario: User 1 buys 50 TATA from User 2

**Step 1: User 2 places SELL order**
```json
POST /api/v1/order
{
  "market": "TATA_INR",
  "price": "950",
  "quantity": "50",
  "side": "sell",
  "userId": "2"
}
```
→ Order goes to orderbook (waiting for buyer)

**Step 2: User 1 places BUY order at same price**
```json
POST /api/v1/order
{
  "market": "TATA_INR",
  "price": "950",
  "quantity": "50",
  "side": "buy",
  "userId": "1"
}
```
→ Trade executes! Both users' balances update.

**Step 3: Verify balances**

User 1:
- INR: 1,000,000 - (50 × 950) = **₹9,52,500**
- TATA: 1,000 + 50 = **1,050 shares**

User 2:
- INR: 1,000,000 + (50 × 950) = **₹10,47,500**
- TATA: 1,000 - 50 = **950 shares**

---

## ❗ Common Issues

### "Insufficient funds"
- Check your available balance (not locked)
- For BUY: Need enough INR
- For SELL: Need enough TATA shares

### Order not executing
- Make sure prices match (buy price >= sell price)
- Check if there are orders on the other side (use /depth API)

### Balance not updating
- Restart the engine
- Delete snapshot.json for fresh start

### Can't connect to API
- Make sure all services are running (engine, api, ws)
- Check Redis is running (docker-compose up -d)
