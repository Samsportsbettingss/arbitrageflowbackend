const express = require('express');
const router = express.Router();
const whopService = require('../services/whopService');
const { authenticateToken } = require('../middleware/auth');

// Get checkout link for a plan
router.post('/checkout', authenticateToken, async (req, res) => {
    try {
        const { plan } = req.body; // 'starter', 'pro', or 'elite'
        
        let productId;
        if (plan === 'starter') productId = process.env.WHOP_PRODUCT_STARTER;
        else if (plan === 'pro') productId = process.env.WHOP_PRODUCT_PRO;
        else if (plan === 'elite') productId = process.env.WHOP_PRODUCT_ELITE;
        else return res.status(400).json({ error: 'Invalid plan' });

        // Get user email from database
        const userEmail = req.user.email || '';
        const checkoutUrl = whopService.createCheckoutLink(productId, userEmail);
        
        res.json({ checkoutUrl });
    } catch (error) {
        console.error('Checkout error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Whop webhook endpoint
router.post('/webhook', async (req, res) => {
    try {
        const signature = req.headers['x-whop-signature'];
        const body = req.body;
        
        await whopService.handleWebhook(body, signature);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(400).json({ error: 'Webhook failed' });
    }
});

// Check user's membership status
router.get('/status', authenticateToken, async (req, res) => {
    try {
        const membership = await whopService.getUserMembershipFromDB(req.user.id);
        res.json(membership);
    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all available plans
router.get('/plans', async (req, res) => {
    try {
        const plans = [
            {
                id: 'starter',
                name: 'Starter Plan',
                price: 47,
                features: [
                    'Live opportunities (2-min delay)',
                    'Up to 50 opportunities/day',
                    'Basic filtering',
                    'Email support'
                ],
                productId: process.env.WHOP_PRODUCT_STARTER
            },
            {
                id: 'pro',
                name: 'Pro Plan',
                price: 97,
                features: [
                    'Real-time opportunities',
                    'Unlimited access',
                    'Advanced filtering',
                    'SMS alerts',
                    'Priority support'
                ],
                productId: process.env.WHOP_PRODUCT_PRO,
                popular: true
            },
            {
                id: 'elite',
                name: 'Elite Plan',
                price: 297,
                features: [
                    'Instant opportunities',
                    'Priority access',
                    'API access',
                    '1-on-1 support',
                    'Custom alerts',
                    'Dedicated account manager'
                ],
                productId: process.env.WHOP_PRODUCT_ELITE
            }
        ];

        res.json({ plans });
    } catch (error) {
        console.error('Plans fetch error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

