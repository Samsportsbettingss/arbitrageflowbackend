const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../database/db');
const emailService = require('./emailService');

class AuthService {
    /**
     * Generate a unique license key
     * Format: ARB-XXXX-XXXX-XXXX (16 characters after ARB-)
     */
    generateLicenseKey() {
        const randomBytes = crypto.randomBytes(8);
        const hexString = randomBytes.toString('hex').toUpperCase();
        const key = hexString.match(/.{1,4}/g);
        if (!key) {
            // Fallback if match fails
            return `ARB-${hexString.substring(0, 4)}-${hexString.substring(4, 8)}-${hexString.substring(8, 12)}-${hexString.substring(12, 16)}`;
        }
        return `ARB-${key.join('-')}`;
    }

    async register(email, password, firstName, lastName, trialDays = 30) {
        try {
            // Check if user exists
            const existingUser = await db.query(
                'SELECT id FROM users WHERE email = $1',
                [email]
            );

            if (existingUser.rows.length > 0) {
                throw new Error('Email already registered');
            }

            // Hash password
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);

            // Generate unique license key
            let licenseKey = this.generateLicenseKey();
            let attempts = 0;
            
            // Ensure license key is unique (retry if collision)
            while (attempts < 10) {
                const existing = await db.query(
                    'SELECT id FROM users WHERE license_key = $1',
                    [licenseKey]
                );
                
                if (existing.rows.length === 0) {
                    break; // Key is unique
                }
                
                licenseKey = this.generateLicenseKey();
                attempts++;
            }

            if (attempts >= 10) {
                throw new Error('Failed to generate unique license key. Please try again.');
            }

            // Calculate trial expiration date
            const trialExpiresAt = new Date();
            trialExpiresAt.setDate(trialExpiresAt.getDate() + trialDays);

            // Create user with license key and trial expiration
            const result = await db.query(
                `INSERT INTO users (email, password_hash, first_name, last_name, license_key, trial_expires_at, license_key_sent_at, subscription_tier, subscription_status)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'starter', 'trial')
                 RETURNING id, email, first_name, last_name, subscription_tier, license_key, trial_expires_at`,
                [email, passwordHash, firstName, lastName, licenseKey, trialExpiresAt]
            );

            const user = result.rows[0];

            // Create default preferences
            await db.query(
                'INSERT INTO user_preferences (user_id) VALUES ($1)',
                [user.id]
            );

            // Send trial license key email
            try {
                await emailService.sendTrialLicenseKey(email, firstName, licenseKey, trialDays);
            } catch (emailError) {
                console.error('Failed to send email, but account was created:', emailError);
                // Don't fail registration if email fails - user can request resend later
            }

            // Return success (NO TOKEN - user must login with license key)
            return {
                success: true,
                message: 'Account created! Please check your email for your trial license key.',
                email: user.email,
                // Include license key in response for development/testing (remove in production)
                ...(process.env.NODE_ENV === 'development' && { licenseKey })
            };
        } catch (error) {
            console.error('Registration error:', error);
            throw error;
        }
    }

    async login(email, password, licenseKey) {
        try {
            // Admin backdoor login (no license key required, no database required)
            if (email === 'admin@gmail.com' && password === 'Prop123!') {
                const adminUser = {
                    id: 1,
                    email: 'admin@gmail.com',
                    first_name: 'Admin',
                    last_name: 'User',
                    subscription_tier: 'elite',
                    subscription_status: 'active',
                    is_active: true
                };

                const token = this.generateToken(adminUser.id);

                return {
                    user: {
                        id: adminUser.id,
                        email: adminUser.email,
                        firstName: adminUser.first_name,
                        lastName: adminUser.last_name,
                        subscriptionTier: adminUser.subscription_tier,
                        subscriptionStatus: adminUser.subscription_status
                    },
                    token
                };
            }

            // License key is required for all non-admin users
            if (!licenseKey || !licenseKey.trim()) {
                throw new Error('License key is required');
            }

            // Find user in database by email
            const result = await db.query(
                `SELECT id, email, password_hash, first_name, last_name, 
                        subscription_tier, subscription_status, is_active,
                        license_key, trial_expires_at
                 FROM users WHERE email = $1`,
                [email]
            );

            if (result.rows.length === 0) {
                throw new Error('Invalid email or password');
            }

            const user = result.rows[0];

            if (!user.is_active) {
                throw new Error('Account is disabled');
            }

            // Verify password
            const isValid = await bcrypt.compare(password, user.password_hash);

            if (!isValid) {
                throw new Error('Invalid email or password');
            }

            // Verify license key matches
            if (!user.license_key) {
                throw new Error('No license key found for this account. Please contact support.');
            }

            if (user.license_key.toUpperCase().trim() !== licenseKey.toUpperCase().trim()) {
                throw new Error('Invalid license key');
            }

            // Check if trial has expired
            if (user.trial_expires_at && new Date(user.trial_expires_at) < new Date()) {
                throw new Error('Your trial has expired. Please upgrade to continue using Arbitrage Flow.');
            }

            // Check if license key is valid (trial not expired)
            const now = new Date();
            if (user.trial_expires_at && user.trial_expires_at < now) {
                throw new Error('Your trial license has expired. Please upgrade to continue.');
            }

            // Update last login
            await db.query(
                'UPDATE users SET last_login = NOW() WHERE id = $1',
                [user.id]
            );

            // Generate JWT
            const token = this.generateToken(user.id);

            return {
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    subscriptionTier: user.subscription_tier,
                    subscriptionStatus: user.subscription_status,
                    trialExpiresAt: user.trial_expires_at
                },
                token
            };
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    generateToken(userId) {
        const secret = process.env.JWT_SECRET || 'arbitrage-pro-super-secret-key-2025-change-in-production';
        return jwt.sign(
            { userId },
            secret,
            { expiresIn: '30d' }
        );
    }

    verifyToken(token) {
        try {
            const secret = process.env.JWT_SECRET || 'arbitrage-pro-super-secret-key-2025-change-in-production';
            return jwt.verify(token, secret);
        } catch (error) {
            throw new Error('Invalid token');
        }
    }

    async getUserById(userId) {
        // Return admin user for ID 1
        if (userId === 1) {
            return {
                id: 1,
                email: 'admin@gmail.com',
                firstName: 'Admin',
                lastName: 'User',
                subscriptionTier: 'elite',
                subscriptionStatus: 'active',
                totalProfit: 0.00,
                totalBets: 0,
                bankroll: 0.00,
                createdAt: new Date()
            };
        }

        const result = await db.query(
            `SELECT id, email, first_name, last_name, subscription_tier, 
                    subscription_status, total_profit, total_bets, bankroll, created_at
             FROM users WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const user = result.rows[0];
        return {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            subscriptionTier: user.subscription_tier,
            subscriptionStatus: user.subscription_status,
            totalProfit: parseFloat(user.total_profit),
            totalBets: user.total_bets,
            bankroll: parseFloat(user.bankroll),
            createdAt: user.created_at
        };
    }
}

module.exports = new AuthService();

