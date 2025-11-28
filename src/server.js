const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
require('dotenv').config();

const oddsService = require('./services/oddsService');
const websocketService = require('./services/websocketService');

// Routes
const authRoutes = require('./routes/auth');
const opportunitiesRoutes = require('./routes/opportunities');
const whopRoutes = require('./routes/whop'); // Using Whop instead of Stripe
const bankrollRoutes = require('./routes/bankroll');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(helmet());

// CORS configuration - support multiple origins
const allowedOrigins = [
    process.env.FRONTEND_URL,
    'https://thearbitrageflow.com',
    'http://thearbitrageflow.com',
    'http://localhost:5500',
    'http://localhost:3000'
].filter(Boolean); // Remove undefined values

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);
        
        // Check if origin is in allowed list
        if (allowedOrigins.some(allowed => origin.startsWith(allowed.replace(/\/$/, '')))) {
            callback(null, true);
        } else {
            // For development, log the origin that was rejected
            if (process.env.NODE_ENV !== 'production') {
                console.log('CORS blocked origin:', origin);
            }
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(morgan('combined'));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
    res.json({
        message: 'Arbitrage Flow API',
        version: '1.0.0',
        status: 'running'
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/opportunities', opportunitiesRoutes);
app.use('/api/whop', whopRoutes); // Whop payment/membership routes
app.use('/api/bankroll', bankrollRoutes); // Bankroll Manager routes

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Initialize WebSocket
websocketService.initialize(server);

// Start arbitrage scanning
const scanInterval = parseInt(process.env.SCAN_INTERVAL_SECONDS || 60) * 1000;

async function scanForArbitrage() {
    try {
        console.log('[SCAN] Starting arbitrage scan...');
        
        const allOdds = await oddsService.fetchAllSports();
        let opportunitiesFound = 0;

        for (const game of allOdds) {
            const opportunities = oddsService.detectArbitrage(game);
            
            for (const opp of opportunities) {
                const oppId = await oddsService.saveOpportunity(opp);
                
                if (oppId) {
                    opportunitiesFound++;
                    console.log(`[OPPORTUNITY] ${opp.eventName} - ${opp.roi}% ROI`);
                    
                    // Notify WebSocket clients
                    websocketService.notifyNewOpportunity({
                        id: oppId,
                        ...opp
                    });
                }
            }
        }

        console.log(`[SCAN] Complete. Found ${opportunitiesFound} new opportunities.`);
        
        // Cleanup expired opportunities
        await oddsService.cleanupExpiredOpportunities();
        
    } catch (error) {
        console.error('[SCAN ERROR]', error);
    }
}

// Run scan immediately on startup
setTimeout(scanForArbitrage, 5000);

// Then run on interval
setInterval(scanForArbitrage, scanInterval);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('=====================================');
    console.log('⚡ ARBITRAGE FLOW BACKEND');
    console.log('=====================================');
    console.log(`🚀 API Server: http://localhost:${PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    console.log(`📊 Scan Interval: ${scanInterval / 1000} seconds`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('=====================================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

