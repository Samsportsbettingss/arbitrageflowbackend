const express = require('express');
const stripeService = require('../services/stripeService');
const { authenticateToken } = require('../middleware/auth');
const db = require('../database/db');

const router = express.Router();

// Create checkout session
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
    try {
        const { plan } = req.body; // starter, pro, or elite
        const userId = req.user.id;

        // Get or create Stripe customer
        let stripeCustomerId = req.user.stripeCustomerId;

        if (!stripeCustomerId) {
            const customer = await stripeService.createCustomer(
                req.user.email,
                `${req.user.firstName} ${req.user.lastName}`
            );
            stripeCustomerId = customer.id;

            // Save to database
            await db.query(
                'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
                [stripeCustomerId, userId]
            );
        }

        // Create checkout session
        const session = await stripeService.createCheckoutSession(
            stripeCustomerId,
            plan,
            `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
            `${process.env.FRONTEND_URL}/subscription/cancelled`
        );

        // Update subscription tier
        await db.query(
            'UPDATE users SET subscription_tier = $1 WHERE id = $2',
            [plan, userId]
        );

        res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Stripe webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['stripe-signature'];

    try {
        await stripeService.handleWebhook(req.body, signature);
        res.json({ received: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(400).send(`Webhook Error: ${error.message}`);
    }
});

// Cancel subscription
router.post('/cancel', authenticateToken, async (req, res) => {
    try {
        const user = await db.query(
            'SELECT stripe_subscription_id FROM users WHERE id = $1',
            [req.user.id]
        );

        if (!user.rows[0].stripe_subscription_id) {
            return res.status(400).json({ error: 'No active subscription' });
        }

        await stripeService.cancelSubscription(user.rows[0].stripe_subscription_id);

        res.json({ message: 'Subscription will be cancelled at period end' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get subscription status
router.get('/status', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT subscription_tier, subscription_status, subscription_start_date, subscription_end_date
             FROM users WHERE id = $1`,
            [req.user.id]
        );

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

