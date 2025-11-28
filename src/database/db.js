const { Pool } = require('pg');
require('dotenv').config();

let pool = null;

try {
    // Railway provides DATABASE_URL as a single connection string
    // Parse it if available, otherwise use individual variables
    let dbConfig;
    
    if (process.env.DATABASE_URL) {
        // Parse DATABASE_URL (Railway format: postgresql://user:pass@host:port/dbname)
        const dbUrl = new URL(process.env.DATABASE_URL);
        dbConfig = {
            host: dbUrl.hostname,
            port: parseInt(dbUrl.port) || 5432,
            database: dbUrl.pathname.slice(1), // Remove leading '/'
            user: dbUrl.username,
            password: dbUrl.password,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        };
    } else {
        // Use individual variables (for local development)
        dbConfig = {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 5432,
            database: process.env.DB_NAME || 'arbitrage_pro',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || '',
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        };
    }
    
    pool = new Pool(dbConfig);

    pool.on('error', (err) => {
        console.error('Database error:', err.message);
    });
} catch (error) {
    console.warn('⚠️  Database not configured. Running in demo mode.');
}

module.exports = {
    query: async (text, params) => {
        if (!pool) {
            console.warn('Database query attempted but DB not available');
            return { rows: [], rowCount: 0 };
        }
        try {
            return await pool.query(text, params);
        } catch (error) {
            console.error('Query error:', error.message);
            return { rows: [], rowCount: 0 };
        }
    },
    pool
};

