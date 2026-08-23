# 🔴 "Error connecting to server" - Quick Fix Guide

## ❌ Error Message
```
Error connecting to server. Please try again.
```

এটা মানে: **Frontend থেকে Backend এ connection হচ্ছে না**

---

## 🎯 Step-by-Step Solution

### ✅ Step 1: Backend Server চালু আছে কিনা Check করুন

#### Windows PowerShell:
```powershell
cd "d:\Sms new\backend"
npm start
```

**Expected Output দেখবেন:**
```
> backend@1.0.0 start
> node server.js

Server running on port 5002
MongoDB connected successfully
```

**❌ যদি এই errors আসে:**

#### Error 1: "Cannot find module"
```powershell
npm install
npm start
```

#### Error 2: "Port 5002 is already in use"
```powershell
# Stop the running process
taskkill /F /IM node.exe

# Then start again
npm start
```

#### Error 3: "MongoDB connection failed"
```
MongooseServerSelectionError: connect ECONNREFUSED
```

**Solution:**
1. `.env` file check করুন:
   ```
   MONGODB_URI=mongodb://localhost:27017/your_database_name
   ```

2. MongoDB service চালু করুন:
   ```powershell
   # Method 1: MongoDB Compass খুলুন
   # Method 2: MongoDB service start করুন
   net start MongoDB
   ```

---

### ✅ Step 2: Backend API Test করুন

Backend চালু থাকা অবস্থায়:

#### Option A: Browser দিয়ে Test
Browser-এ এই URL খুলুন:
```
http://localhost:5002/api/ucc/batches
```

**✅ Success দেখবেন:**
```json
{
  "success": true,
  "count": 5,
  "batches": [...]
}
```

**❌ Error দেখবেন:**
- "This site can't be reached" = Backend running নেই
- "Cannot GET /api/ucc/batches" = Route not found
- Empty page = Backend crashed

---

#### Option B: PowerShell দিয়ে Test
```powershell
curl http://localhost:5002/api/ucc/batches
```

---

### ✅ Step 3: Frontend API URL Check করুন

#### Browser Console-এ (F12) এটা run করুন:
```javascript
// Check API_BASE_URL
console.log('API Base URL:', API_BASE_URL);

// Test connection
fetch('http://localhost:5002/api/ucc/batches')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error);
```

**Expected Output:**
```
API Base URL: http://localhost:5002/api
{success: true, count: 5, batches: Array(5)}
```

**❌ যদি Error আসে:**
```
TypeError: Failed to fetch
```
এর মানে: Backend এ connection হচ্ছে না

---

### ✅ Step 4: CORS Check করুন

Backend-এ `server.js` file check করুন:

```javascript
// backend/server.js
const cors = require('cors');

// CORS configuration
app.use(cors({
  origin: '*', // বা specific origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true
}));
```

যদি CORS configuration না থাকে:
```powershell
cd backend
npm install cors
```

Then add to `server.js`:
```javascript
const cors = require('cors');
app.use(cors());
```

---

### ✅ Step 5: Port Conflict Check করুন

```powershell
# Check if port 5002 is in use
netstat -ano | findstr :5002
```

**Output যদি থাকে:**
```
TCP    0.0.0.0:5002    0.0.0.0:0    LISTENING    12345
```

এর মানে: অন্য process port 5002 use করছে

**Fix:**
```powershell
# Kill the process (replace 12345 with actual PID)
taskkill /F /PID 12345

# Then restart backend
cd "d:\Sms new\backend"
npm start
```

---

### ✅ Step 6: Firewall Check করুন

Windows Firewall port 5002 block করছে কিনা:

1. Windows Security খুলুন
2. Firewall & network protection → Allow an app through firewall
3. Node.js allow করা আছে কিনা check করুন

---

## 🧪 Complete Test Sequence

### Terminal 1: Backend
```powershell
cd "d:\Sms new\backend"
npm start
```

**Wait for:**
```
Server running on port 5002
MongoDB connected successfully
```

### Terminal 2: Test API
```powershell
curl http://localhost:5002/api/ucc/batches
```

### Browser: Frontend Test
1. Open: `http://localhost:5002/ucc/admission.html`
2. Fill form
3. Press F12 (Console)
4. Submit
5. Check console logs:
   ```
   [ADMISSION] Submitting to: http://localhost:5002/api/ucc/admission
   [ADMISSION] Response status: 201 Created
   ```

---

## 🔍 Common Error Messages & Fixes

### Error 1: "Failed to fetch"
```
TypeError: Failed to fetch
```
**Cause:** Backend not running  
**Fix:** `cd backend && npm start`

---

### Error 2: "ECONNREFUSED"
```
Error: connect ECONNREFUSED 127.0.0.1:5002
```
**Cause:** Nothing listening on port 5002  
**Fix:** Start backend server

---

### Error 3: "MongooseServerSelectionError"
```
MongooseServerSelectionError: connect ECONNREFUSED
```
**Cause:** MongoDB not running  
**Fix:** Start MongoDB service

---

### Error 4: "404 Not Found"
```
HTTP 404: Cannot POST /api/ucc/admission
```
**Cause:** Route not configured  
**Fix:** Check `backend/routes/ucc.js` properly imported in `server.js`

---

### Error 5: "CORS Error"
```
Access to fetch blocked by CORS policy
```
**Cause:** CORS not enabled  
**Fix:** Add `app.use(cors())` in `server.js`

---

## 📋 Quick Checklist

Before submitting admission/payment:

- [ ] Backend terminal open and shows "Server running on port 5002"
- [ ] MongoDB connected successfully message দেখা যাচ্ছে
- [ ] `http://localhost:5002/api/ucc/batches` browser-এ JSON response দিচ্ছে
- [ ] Browser console (F12) open করা আছে
- [ ] No red errors in backend terminal
- [ ] Frontend page থেকে backend same port-এ access করছে

---

## 🚀 One-Command Backend Check

```powershell
# Test everything at once
cd "d:\Sms new\backend"; npm start; Start-Sleep -Seconds 3; curl http://localhost:5002/api/ucc/batches
```

---

## 💡 Tips

1. **Always keep backend terminal visible** while testing
2. **Watch for errors in backend terminal** when submitting
3. **Keep browser console (F12) open** to see frontend errors
4. **Test API directly** with curl/browser before testing through UI
5. **Check MongoDB Compass** to verify database has data

---

## 📸 Send These Screenshots if Problem Persists:

1. **Backend Terminal** - Full output after `npm start`
2. **Browser Console (F12)** - After clicking submit
3. **Network Tab (F12)** - Failed request details
4. **Error Alert Message** - Exact error text

---

**Most Common Solution:**
```powershell
# 90% of "Error connecting to server" issues are fixed by:
cd "d:\Sms new\backend"
npm start

# Wait for "Server running on port 5002"
# Then refresh browser and try again
```

---

Created: August 20, 2026  
For: UCC Pabna Admin System
