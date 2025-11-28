# Arbitrage Flow Backend

Complete Node.js backend with real-time odds integration, WebSocket support, and Stripe payments.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Set Up Environment Variables
```bash
cp .env.example .env
```

Edit `.env` and add your API keys:
- Get The Odds API key from: https://the-odds-api.com
- Get Stripe keys from: https://dashboard.stripe.com
- Configure your database

### 3. Set Up Database
```bash
# Create PostgreSQL database
createdb arbitrage_pro

# Run schema
psql arbitrage_pro < database/schema.sql
```

### 4. Start Server
```bash
# Development
npm run dev

# Production
npm start
```

## 📁 Project Structure

```
backend/
├── src/
│   ├── server.js                 # Main server file
│   ├── database/
│   │   └── db.js                 # Database connection
│   ├── services/
│   │   ├── oddsService.js        # Odds API integration
│   │   ├── websocketService.js   # Real-time updates
│   │   ├── stripeService.js      # Payment processing
│   │   └── authService.js        # Authentication
│   ├── routes/
│   │   ├── auth.js               # Auth endpoints
│   │   ├── opportunities.js      # Opportunities endpoints
│   │   └── subscriptions.js      # Subscription endpoints
│   └── middleware/
│       └── auth.js                # Auth middleware
├── database/
│   └── schema.sql                 # Database schema
├── package.json
└── .env.example
```

## 🔌 API Endpoints

### Authentication
```
POST /api/auth/register       - Register new user
POST /api/auth/login          - Login user
GET  /api/auth/me             - Get current user
PUT  /api/auth/profile        - Update profile
```

### Opportunities
```
GET  /api/opportunities              - Get all opportunities
GET  /api/opportunities/:id          - Get specific opportunity
POST /api/opportunities/:id/save     - Save opportunity
GET  /api/opportunities/saved/list   - Get saved opportunities
```

### Subscriptions
```
POST /api/subscriptions/create-checkout-session  - Create Stripe checkout
POST /api/subscriptions/webhook                  - Stripe webhook
POST /api/subscriptions/cancel                   - Cancel subscription
GET  /api/subscriptions/status                   - Get subscription status
```

## 🔐 Authentication

All protected routes require a JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

## 🌐 WebSocket Connection

Connect to WebSocket for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:3000?token=YOUR_JWT_TOKEN');

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'NEW_OPPORTUNITY') {
        console.log('New arbitrage opportunity:', data.data);
    }
};
```

## 💳 Stripe Integration

### Webhook Setup

1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
2. Login: `stripe login`
3. Forward webhooks: `stripe listen --forward-to localhost:3000/api/subscriptions/webhook`
4. Copy webhook secret to `.env`

### Create Products in Stripe

Create three products in Stripe Dashboard:
- Starter: $47/month
- Pro: $97/month
- Elite: $297/month

Update the price IDs in `src/services/stripeService.js`

## 🗄️ Database Schema

Key tables:
- `users` - User accounts
- `opportunities` - Detected arbitrage opportunities
- `bets` - User betting history
- `sportsbook_accounts` - Bankroll management
- `transactions` - Financial transactions
- `payments` - Stripe payment records

## 📊 Monitoring

The system automatically:
- Scans for arbitrage opportunities every 60 seconds
- Cleans up expired opportunities
- Logs all API requests
- Tracks user activity

## 🔧 Configuration

Key environment variables:
- `SCAN_INTERVAL_SECONDS` - How often to scan (default: 60)
- `MIN_ROI_THRESHOLD` - Minimum ROI to save (default: 1.0)
- `OPPORTUNITY_EXPIRY_MINUTES` - How long opportunities stay active (default: 10)

## 🚨 Production Deployment

### Deploy to DigitalOcean/AWS

1. Set up PostgreSQL database
2. Set up Redis (optional, for caching)
3. Configure environment variables
4. Use PM2 for process management:

```bash
npm install -g pm2
pm2 start src/server.js --name arbitrage-pro
pm2 save
pm2 startup
```

### Required Services
- PostgreSQL 14+
- Node.js 18+
- Redis (optional)

## 📈 Scaling

For high traffic:
1. Use Redis for caching frequently accessed data
2. Implement database connection pooling (already configured)
3. Use load balancer for multiple instances
4. Consider separating WebSocket server

## 🐛 Debugging

Enable detailed logs:
```bash
NODE_ENV=development npm run dev
```

Check logs:
```bash
pm2 logs arbitrage-pro
```

## 📚 Additional Resources

- The Odds API Docs: https://the-odds-api.com/liveapi/guides/v4/
- Stripe API Docs: https://stripe.com/docs/api
- WebSocket API: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket

## 🤝 Support

For issues or questions, check the main IMPLEMENTATION_ROADMAP.md file.

