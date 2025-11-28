-- Arbitrage Pro Database Schema

-- Users Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    subscription_tier VARCHAR(50) DEFAULT 'free', -- free, starter, pro, elite
    subscription_status VARCHAR(50) DEFAULT 'inactive', -- inactive, active, cancelled, past_due
    stripe_customer_id VARCHAR(255) UNIQUE,
    stripe_subscription_id VARCHAR(255),
    subscription_start_date TIMESTAMP,
    subscription_end_date TIMESTAMP,
    total_profit DECIMAL(10, 2) DEFAULT 0,
    total_bets INTEGER DEFAULT 0,
    bankroll DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    verification_token VARCHAR(255)
);

-- User Preferences Table
CREATE TABLE user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    min_roi DECIMAL(5, 2) DEFAULT 1.0,
    preferred_sports JSONB DEFAULT '[]', -- ["basketball_nba", "americanfootball_nfl"]
    preferred_markets JSONB DEFAULT '[]', -- ["h2h", "spreads", "totals"]
    available_sportsbooks JSONB DEFAULT '[]', -- ["draftkings", "fanduel"]
    email_notifications BOOLEAN DEFAULT true,
    sms_notifications BOOLEAN DEFAULT false,
    push_notifications BOOLEAN DEFAULT true,
    notification_min_roi DECIMAL(5, 2) DEFAULT 3.0,
    odds_format VARCHAR(20) DEFAULT 'american', -- american, decimal, fractional
    currency VARCHAR(10) DEFAULT 'USD',
    timezone VARCHAR(50) DEFAULT 'America/New_York',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Arbitrage Opportunities Table
CREATE TABLE opportunities (
    id SERIAL PRIMARY KEY,
    sport VARCHAR(100) NOT NULL,
    league VARCHAR(100),
    event_name VARCHAR(255) NOT NULL,
    home_team VARCHAR(100),
    away_team VARCHAR(100),
    market_type VARCHAR(50) NOT NULL, -- h2h, spreads, totals
    market_key VARCHAR(100),
    
    -- Book 1
    book1_name VARCHAR(100) NOT NULL,
    book1_outcome VARCHAR(255) NOT NULL,
    book1_odds DECIMAL(8, 2) NOT NULL,
    book1_decimal_odds DECIMAL(8, 4) NOT NULL,
    
    -- Book 2
    book2_name VARCHAR(100) NOT NULL,
    book2_outcome VARCHAR(255) NOT NULL,
    book2_odds DECIMAL(8, 2) NOT NULL,
    book2_decimal_odds DECIMAL(8, 4) NOT NULL,
    
    -- Book 3 (for 3-way markets)
    book3_name VARCHAR(100),
    book3_outcome VARCHAR(255),
    book3_odds DECIMAL(8, 2),
    book3_decimal_odds DECIMAL(8, 4),
    
    -- Arbitrage Metrics
    roi DECIMAL(5, 2) NOT NULL,
    profit_per_1000 DECIMAL(8, 2) NOT NULL,
    implied_probability_total DECIMAL(8, 4) NOT NULL,
    
    -- Timing
    commence_time TIMESTAMP NOT NULL,
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT true,
    
    -- Metadata
    odds_last_updated TIMESTAMP,
    view_count INTEGER DEFAULT 0,
    save_count INTEGER DEFAULT 0
);

-- Create index for faster queries
CREATE INDEX idx_opportunities_active ON opportunities(is_active, expires_at);
CREATE INDEX idx_opportunities_roi ON opportunities(roi DESC);
CREATE INDEX idx_opportunities_sport ON opportunities(sport);
CREATE INDEX idx_opportunities_detected_at ON opportunities(detected_at DESC);

-- User Saved Opportunities
CREATE TABLE saved_opportunities (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE CASCADE,
    notes TEXT,
    saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, opportunity_id)
);

-- User Bets History
CREATE TABLE bets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    opportunity_id INTEGER REFERENCES opportunities(id),
    
    -- Event Details
    sport VARCHAR(100),
    event_name VARCHAR(255) NOT NULL,
    market_type VARCHAR(50),
    
    -- Bet Details
    book1_name VARCHAR(100) NOT NULL,
    book1_stake DECIMAL(10, 2) NOT NULL,
    book1_odds DECIMAL(8, 2) NOT NULL,
    book1_outcome VARCHAR(255) NOT NULL,
    
    book2_name VARCHAR(100) NOT NULL,
    book2_stake DECIMAL(10, 2) NOT NULL,
    book2_odds DECIMAL(8, 2) NOT NULL,
    book2_outcome VARCHAR(255) NOT NULL,
    
    book3_name VARCHAR(100),
    book3_stake DECIMAL(10, 2),
    book3_odds DECIMAL(8, 2),
    book3_outcome VARCHAR(255),
    
    -- Results
    total_stake DECIMAL(10, 2) NOT NULL,
    expected_return DECIMAL(10, 2) NOT NULL,
    expected_profit DECIMAL(10, 2) NOT NULL,
    expected_roi DECIMAL(5, 2) NOT NULL,
    
    actual_profit DECIMAL(10, 2),
    actual_roi DECIMAL(5, 2),
    
    status VARCHAR(50) DEFAULT 'pending', -- pending, settled, voided, won, lost
    winning_book VARCHAR(100),
    
    -- Timing
    placed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    settled_at TIMESTAMP,
    event_time TIMESTAMP,
    
    -- Notes
    notes TEXT
);

CREATE INDEX idx_bets_user_id ON bets(user_id);
CREATE INDEX idx_bets_status ON bets(status);
CREATE INDEX idx_bets_placed_at ON bets(placed_at DESC);

-- Sportsbook Accounts (Bankroll Manager)
CREATE TABLE sportsbook_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    sportsbook_name VARCHAR(100) NOT NULL,
    account_balance DECIMAL(10, 2) DEFAULT 0,
    account_username VARCHAR(255),
    account_notes TEXT,
    is_active BOOLEAN DEFAULT true,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, sportsbook_name)
);

-- Bankroll Transactions
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    sportsbook_account_id INTEGER REFERENCES sportsbook_accounts(id),
    transaction_type VARCHAR(50) NOT NULL, -- deposit, withdrawal, bet_stake, bet_return
    amount DECIMAL(10, 2) NOT NULL,
    balance_after DECIMAL(10, 2) NOT NULL,
    description TEXT,
    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_date ON transactions(transaction_date DESC);

-- Notifications Table
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- opportunity, account, system
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    opportunity_id INTEGER REFERENCES opportunities(id),
    is_read BOOLEAN DEFAULT false,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id, is_read);

-- Payment History
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    stripe_payment_id VARCHAR(255) UNIQUE,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    status VARCHAR(50) NOT NULL, -- succeeded, pending, failed, refunded
    description TEXT,
    subscription_tier VARCHAR(50),
    payment_method VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API Usage Tracking (for rate limiting and analytics)
CREATE TABLE api_usage (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_usage_user_date ON api_usage(user_id, created_at);

-- System Settings
CREATE TABLE system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default system settings
INSERT INTO system_settings (key, value, description) VALUES
('min_roi_threshold', '1.0', 'Minimum ROI to save opportunities'),
('scan_interval_seconds', '60', 'How often to scan for new opportunities'),
('opportunity_expiry_minutes', '10', 'How long to keep opportunities active'),
('maintenance_mode', 'false', 'Enable maintenance mode');

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sportsbook_accounts_updated_at BEFORE UPDATE ON sportsbook_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create view for user statistics
CREATE VIEW user_stats AS
SELECT 
    u.id as user_id,
    u.email,
    u.subscription_tier,
    COUNT(DISTINCT b.id) as total_bets,
    COALESCE(SUM(b.actual_profit), 0) as total_profit,
    COALESCE(AVG(b.actual_roi), 0) as average_roi,
    COUNT(DISTINCT so.id) as saved_opportunities,
    COALESCE(SUM(sa.account_balance), 0) as total_bankroll
FROM users u
LEFT JOIN bets b ON u.id = b.user_id AND b.status = 'settled'
LEFT JOIN saved_opportunities so ON u.id = so.user_id
LEFT JOIN sportsbook_accounts sa ON u.id = sa.user_id AND sa.is_active = true
GROUP BY u.id, u.email, u.subscription_tier;

-- Create view for active opportunities with stats
CREATE VIEW active_opportunities_view AS
SELECT 
    o.*,
    COUNT(DISTINCT so.user_id) as times_saved,
    COUNT(DISTINCT b.user_id) as times_bet
FROM opportunities o
LEFT JOIN saved_opportunities so ON o.id = so.opportunity_id
LEFT JOIN bets b ON o.id = b.opportunity_id
WHERE o.is_active = true AND o.expires_at > CURRENT_TIMESTAMP
GROUP BY o.id;

