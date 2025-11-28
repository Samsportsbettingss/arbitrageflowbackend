const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('../database/db');

class StripeService {
    constructor() {
        this.plans = {
            starter: {
                priceId: 'price_starter_monthly', // Replace with your Stripe Price ID
                amount: 4700, // $47.00 in cents
                name: 'Starter Plan',
                features: ['Live opportunities (2-min delay)', 'Up to 50 opportunities/day', 'Basic filtering']
            },
            pro: {
                priceId: 'price_pro_monthly',
                amount: 9700, // $97.00
                name: 'Pro Plan',
                features: ['Real-time opportunities', 'Unlimited access', 'Advanced filtering', 'SMS alerts']
            },
            elite: {
                priceId: 'price_elite_monthly',
                amount: 29700, // $297.00
                name: 'Elite Plan',
                features: ['Instant opportunities', 'Priority access', 'API access', '1-on-1 support']
            }
        };
    }

    async createCustomer(email, name) {
        try {
            const customer = await stripe.customers.create({
                email,
                name,
                metadata: {
                    platform: 'arbitrage_pro'
                }
            });
            return customer;
        } catch (error) {
            console.error('Error creating Stripe customer:', error);
            throw error;
        }
    }

    async createSubscription(customerId, planKey) {
        if (!this.plans[planKey]) {
            throw new Error('Invalid plan');
        }

        try {
            const subscription = await stripe.subscriptions.create({
                customer: customerId,
                items: [{ price: this.plans[planKey].priceId }],
                payment_behavior: 'default_incomplete',
                payment_settings: { save_default_payment_method: 'on_subscription' },
                expand: ['latest_invoice.payment_intent']
            });

            return subscription;
        } catch (error) {
            console.error('Error creating subscription:', error);
            throw error;
        }
    }

    async createCheckoutSession(customerId, planKey, successUrl, cancelUrl) {
        if (!this.plans[planKey]) {
            throw new Error('Invalid plan');
        }

        try {
            const session = await stripe.checkout.sessions.create({
                customer: customerId,
                payment_method_types: ['card'],
                line_items: [
                    {
                        price: this.plans[planKey].priceId,
                        quantity: 1,
                    },
                ],
                mode: 'subscription',
                success_url: successUrl,
                cancel_url: cancelUrl,
                subscription_data: {
                    trial_period_days: 7, // 7-day free trial
                }
            });

            return session;
        } catch (error) {
            console.error('Error creating checkout session:', error);
            throw error;
        }
    }

    async cancelSubscription(subscriptionId) {
        try {
            const subscription = await stripe.subscriptions.update(subscriptionId, {
                cancel_at_period_end: true
            });
            return subscription;
        } catch (error) {
            console.error('Error canceling subscription:', error);
            throw error;
        }
    }

    async cancelSubscriptionImmediately(subscriptionId) {
        try {
            const subscription = await stripe.subscriptions.cancel(subscriptionId);
            return subscription;
        } catch (error) {
            console.error('Error canceling subscription immediately:', error);
            throw error;
        }
    }

    async updateSubscription(subscriptionId, newPlanKey) {
        if (!this.plans[newPlanKey]) {
            throw new Error('Invalid plan');
        }

        try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            
            const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
                items: [{
                    id: subscription.items.data[0].id,
                    price: this.plans[newPlanKey].priceId,
                }],
                proration_behavior: 'always_invoice'
            });

            return updatedSubscription;
        } catch (error) {
            console.error('Error updating subscription:', error);
            throw error;
        }
    }

    async handleWebhook(payload, signature) {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        try {
            const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

            switch (event.type) {
                case 'customer.subscription.created':
                    await this.handleSubscriptionCreated(event.data.object);
                    break;

                case 'customer.subscription.updated':
                    await this.handleSubscriptionUpdated(event.data.object);
                    break;

                case 'customer.subscription.deleted':
                    await this.handleSubscriptionDeleted(event.data.object);
                    break;

                case 'invoice.payment_succeeded':
                    await this.handlePaymentSucceeded(event.data.object);
                    break;

                case 'invoice.payment_failed':
                    await this.handlePaymentFailed(event.data.object);
                    break;

                default:
                    console.log(`Unhandled event type: ${event.type}`);
            }

            return { received: true };
        } catch (error) {
            console.error('Webhook error:', error);
            throw error;
        }
    }

    async handleSubscriptionCreated(subscription) {
        const customerId = subscription.customer;
        const status = subscription.status;

        const query = `
            UPDATE users 
            SET subscription_status = $1,
                subscription_start_date = $2,
                stripe_subscription_id = $3
            WHERE stripe_customer_id = $4
        `;

        await db.query(query, [status, new Date(), subscription.id, customerId]);
        console.log(`Subscription created for customer ${customerId}`);
    }

    async handleSubscriptionUpdated(subscription) {
        const customerId = subscription.customer;
        const status = subscription.status;
        const currentPeriodEnd = new Date(subscription.current_period_end * 1000);

        const query = `
            UPDATE users 
            SET subscription_status = $1,
                subscription_end_date = $2
            WHERE stripe_customer_id = $3
        `;

        await db.query(query, [status, currentPeriodEnd, customerId]);
        console.log(`Subscription updated for customer ${customerId}`);
    }

    async handleSubscriptionDeleted(subscription) {
        const customerId = subscription.customer;

        const query = `
            UPDATE users 
            SET subscription_status = 'cancelled',
                subscription_tier = 'free',
                subscription_end_date = NOW()
            WHERE stripe_customer_id = $1
        `;

        await db.query(query, [customerId]);
        console.log(`Subscription deleted for customer ${customerId}`);
    }

    async handlePaymentSucceeded(invoice) {
        const customerId = invoice.customer;
        const amount = invoice.amount_paid / 100;
        const subscriptionId = invoice.subscription;

        // Record payment
        const paymentQuery = `
            INSERT INTO payments (user_id, stripe_payment_id, amount, status, description)
            SELECT id, $1, $2, 'succeeded', $3
            FROM users WHERE stripe_customer_id = $4
        `;

        await db.query(paymentQuery, [invoice.payment_intent, amount, 'Subscription payment', customerId]);

        // Update subscription status
        const updateQuery = `
            UPDATE users 
            SET subscription_status = 'active'
            WHERE stripe_customer_id = $1
        `;

        await db.query(updateQuery, [customerId]);
        console.log(`Payment succeeded for customer ${customerId}: $${amount}`);
    }

    async handlePaymentFailed(invoice) {
        const customerId = invoice.customer;

        const query = `
            UPDATE users 
            SET subscription_status = 'past_due'
            WHERE stripe_customer_id = $1
        `;

        await db.query(query, [customerId]);
        console.log(`Payment failed for customer ${customerId}`);
    }
}

module.exports = new StripeService();

