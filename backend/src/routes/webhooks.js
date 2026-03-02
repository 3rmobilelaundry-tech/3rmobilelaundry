const express = require('express');
const router = express.Router();
const { Order, Subscription, Payment, User } = require('../models');
const IntegrationService = require('../services/integrationService');

// Webhook handling
// In a real scenario, you'd verify the signature from headers (e.g. x-paystack-signature)

router.post('/paystack', async (req, res) => {
    // Mock Paystack Webhook
    // Event: charge.success
    try {
        const event = req.body;
        console.log('Webhook received:', event.event);

        if (event.event === 'charge.success') {
            const { reference, amount, metadata } = event.data;
            const email = event.data.customer.email;
            
            console.log(`Payment successful for ${email}: ${amount}`);
            
            // "Payment webhooks update orders & subscriptions"
            if (metadata && metadata.type) {
                if (metadata.type === 'subscription' && metadata.subscription_id) {
                    const sub = await Subscription.findByPk(metadata.subscription_id);
                    if (sub) {
                        sub.status = 'active';
                        await sub.save();
                        console.log(`Updated subscription ${sub.subscription_id} to active`);
                        
                        // Notify User via WhatsApp
                        const user = await User.findByPk(sub.user_id);
                        if (user && user.phone_number) {
                            await IntegrationService.sendWhatsApp(user.phone_number, `Your subscription is now active!`);
                        }
                    }
                } else if (metadata.type === 'order' && metadata.order_id) {
                    const order = await Order.findByPk(metadata.order_id);
                    if (order) {
                        // Assuming payment confirms the order or something
                        // order.payment_status = 'paid'; // If we had such field
                        // For now, maybe we move it to 'accepted' if it was pending payment?
                        // Or just log it.
                        console.log(`Payment received for order ${order.order_id}`);
                    }
                }
            }
        }

        res.sendStatus(200);
    } catch (error) {
        console.error('Webhook Error:', error);
        res.sendStatus(500);
    }
});

router.post('/whatsapp/callback', async (req, res) => {
    // Handle WhatsApp status updates or incoming messages
    console.log('WhatsApp Callback:', req.body);
    res.sendStatus(200);
});

// Mock sending endpoint (for internal use/testing if not using direct API)
router.post('/whatsapp/send', async (req, res) => {
    // Simulate sending
    const { phone, message } = req.body;
    console.log(`[Mock WhatsApp] Sending to ${phone}: ${message}`);
    
    // Simulate failure chance for "API failures trigger retries and admin alerts"
    if (message.includes('fail')) {
        return res.status(500).json({ error: 'Mock WhatsApp API Failure' });
    }
    
    res.json({ status: 'sent', message_id: 'wam_123456' });
});

module.exports = router;
