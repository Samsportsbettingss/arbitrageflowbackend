# Arbitrage Flow Backend - Railway Deployment

## 🚀 Quick Deploy to Railway

This backend is ready to deploy to Railway with zero configuration changes!

### Step 1: Upload to GitHub

1. Create a new repository on GitHub
2. Upload the contents of this zip file
3. Push to your repository

### Step 2: Deploy to Railway

1. Go to [Railway](https://railway.app/)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository
5. Railway will auto-detect Node.js and deploy!

### Step 3: Add PostgreSQL Database

1. In Railway dashboard, click "New"
2. Select "Database" → "Add PostgreSQL"
3. Railway automatically creates `DATABASE_URL` environment variable

### Step 4: Configure Environment Variables

In Railway → Your Service → Variables tab, add:

**Required:**
```
ODDS_API_KEY=your_key_from_the-odds-api.com
JWT_SECRET=generate_random_string_here
FRONTEND_URL=https://your-frontend-domain.com
```

**Optional (for email):**
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@arbitrageflow.com
```

### Step 5: Run Database Migration

After deployment, connect to your Railway PostgreSQL and run:

```bash
# Via Railway CLI or pgAdmin
psql $DATABASE_URL < database/schema.sql
psql $DATABASE_URL < database/migrations/add_license_keys.sql
```

Or use Railway's PostgreSQL service terminal to run the migrations.

### Step 6: Set Build Command (If Needed)

Railway should auto-detect, but if not:
- **Build Command**: (leave empty - no build step)
- **Start Command**: `node src/server.js`

---

## 📁 Project Structure

```
backend/
├── src/
│   ├── server.js              # Main entry point
│   ├── database/
│   │   └── db.js             # Database connection
│   ├── services/
│   │   ├── oddsService.js    # The Odds API integration
│   │   ├── authService.js    # Authentication & license keys
│   │   ├── emailService.js   # Email sending
│   │   └── websocketService.js
│   ├── routes/
│   │   ├── auth.js           # Auth endpoints
│   │   ├── opportunities.js  # Opportunities API
│   │   ├── bankroll.js       # Bankroll manager
│   │   └── whop.js           # Whop payments
│   └── middleware/
│       └── auth.js           # JWT auth middleware
├── database/
│   ├── schema.sql            # Main database schema
│   └── migrations/
│       └── add_license_keys.sql
├── package.json
└── README-RAILWAY.md         # This file
```

---

## 🔑 Getting Your API Keys

### The Odds API Key
1. Visit: https://the-odds-api.com/
2. Sign up (free tier: 500 requests/month)
3. Copy your API key from dashboard
4. Add to Railway as `ODDS_API_KEY`

### Generate JWT Secret
```bash
# Mac/Linux
openssl rand -base64 32

# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

---

## ✅ Verification

After deployment, check Railway logs for:
- ✅ "Arbitrage Flow Backend" startup message
- ✅ Database connection success
- ✅ WebSocket server running
- ✅ API server listening

Visit: `https://your-railway-url.railway.app/health`
Should return: `{"status":"healthy"}`

---

## 📚 Additional Resources

- Railway Docs: https://docs.railway.app/
- The Odds API: https://the-odds-api.com/liveapi/guides/v4/

---

**Ready to deploy!** 🚀

