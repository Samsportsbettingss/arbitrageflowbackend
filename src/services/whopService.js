const db = require('../database/db');

class WhopService {
    constructor() {
        this.apiKey = process.env.WHOP_API_KEY;
        this.companyId = process.env.WHOP_COMPANY_ID;
        this.baseUrl = 'https://api.whop.com/v2';
    }

    async verifyUser(whopUserId) {
        try {
            if (!this.apiKey) {
                console.warn('Whop API key not configured');
                return { isActive: false, tier: 'free' };
            }

            const response = await fetch(`${this.baseUrl}/memberships/${whopUserId}`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to verify Whop membership');
            }

            const membership = await response.json();
            
            return {
                isActive: membership.valid,
                tier: this.getTierFromProduct(membership.product_id),
                expiresAt: new Date(membership.expires_at * 1000),
                whopUserId: membership.user_id
            };
        } catch (error) {
            console.error('Whop verification error:', error);
            return { isActive: false, tier: 'free' };
        }
    }

    getTierFromProduct(productId) {
        if (productId === process.env.WHOP_PRODUCT_STARTER) return 'starter';
        if (productId === process.env.WHOP_PRODUCT_PRO) return 'pro';
        if (productId === process.env.WHOP_PRODUCT_ELITE) return 'elite';
        return 'free';
    }

    async handleWebhook(body, signature) {
        // Verify webhook signature
        const webhookSecret = process.env.WHOP_WEBHOOK_SECRET;
        
        // TODO: Add signature verification when implementing
        // For now, process the event
        
        const event = body;

        try {
            switch (event.action) {
                case 'membership.went_valid':
                    await this.handleMembershipCreated(event.data);
                    break;
                
                case 'membership.went_invalid':
                    await this.handleMembershipCancelled(event.data);
                    break;
                
                case 'membership.updated':
                    await this.handleMembershipUpdated(event.data);
                    break;

                default:
                    console.log(`Unhandled Whop event: ${event.action}`);
            }

            return { success: true };
        } catch (error) {
            console.error('Whop webhook error:', error);
            throw error;
        }
    }

    async handleMembershipCreated(membership) {
        try {
            const tier = this.getTierFromProduct(membership.product);
            const expiresAt = membership.renewal_period_end ? new Date(membership.renewal_period_end * 1000) : null;

            // Check if user exists
            const existingUser = await db.query(
                'SELECT id FROM users WHERE whop_user_id = $1',
                [membership.user]
            );

            if (existingUser.rows.length > 0) {
                // Update existing user
                await db.query(
                    `UPDATE users 
                     SET subscription_tier = $1, 
                         subscription_status = 'active',
                         subscription_end_date = $2
                     WHERE whop_user_id = $3`,
                    [tier, expiresAt, membership.user]
                );
            } else {
                // Create new user if email is provided
                if (membership.email) {
                    await db.query(
                        `INSERT INTO users (email, whop_user_id, subscription_tier, subscription_status, subscription_end_date, created_at)
                         VALUES ($1, $2, $3, 'active', $4, NOW())
                         ON CONFLICT (email) DO UPDATE
                         SET whop_user_id = $2, subscription_tier = $3, subscription_status = 'active', subscription_end_date = $4`,
                        [membership.email, membership.user, tier, expiresAt]
                    );
                }
            }

            console.log(`✅ Whop membership created: ${membership.user} - ${tier}`);
        } catch (error) {
            console.error('Error handling membership creation:', error);
        }
    }

    async handleMembershipUpdated(membership) {
        try {
            const tier = this.getTierFromProduct(membership.product);
            const expiresAt = membership.renewal_period_end ? new Date(membership.renewal_period_end * 1000) : null;
            const status = membership.valid ? 'active' : 'expired';

            await db.query(
                `UPDATE users 
                 SET subscription_tier = $1,
                     subscription_status = $2,
                     subscription_end_date = $3
                 WHERE whop_user_id = $4`,
                [tier, status, expiresAt, membership.user]
            );

            console.log(`🔄 Whop membership updated: ${membership.user}`);
        } catch (error) {
            console.error('Error handling membership update:', error);
        }
    }

    async handleMembershipCancelled(membership) {
        try {
            await db.query(
                `UPDATE users 
                 SET subscription_status = 'cancelled',
                     subscription_tier = 'free'
                 WHERE whop_user_id = $1`,
                [membership.user]
            );

            console.log(`❌ Whop membership cancelled: ${membership.user}`);
        } catch (error) {
            console.error('Error handling membership cancellation:', error);
        }
    }

    createCheckoutLink(productId, userEmail = '') {
        // Generate Whop checkout link
        const baseCheckoutUrl = `https://whop.com/checkout`;
        
        if (userEmail) {
            return `${baseCheckoutUrl}?plan=${productId}&email=${encodeURIComponent(userEmail)}`;
        }
        
        return `${baseCheckoutUrl}?plan=${productId}`;
    }

    async getUserMembershipFromDB(userId) {
        try {
            const result = await db.query(
                `SELECT subscription_tier, subscription_status, subscription_end_date, whop_user_id
                 FROM users 
                 WHERE id = $1`,
                [userId]
            );

            if (result.rows.length === 0) {
                return { tier: 'free', status: 'inactive', isActive: false };
            }

            const user = result.rows[0];
            const isActive = user.subscription_status === 'active' && 
                           (!user.subscription_end_date || new Date(user.subscription_end_date) > new Date());

            return {
                tier: user.subscription_tier || 'free',
                status: user.subscription_status || 'inactive',
                expiresAt: user.subscription_end_date,
                whopUserId: user.whop_user_id,
                isActive
            };
        } catch (error) {
            console.error('Error getting user membership:', error);
            return { tier: 'free', status: 'inactive', isActive: false };
        }
    }
}

module.exports = new WhopService();

