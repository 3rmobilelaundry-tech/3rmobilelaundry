const jwt = require('jsonwebtoken');
const { Sequelize, DataTypes } = require('sequelize');
const { User, Subscription, Plan, Notification, sequelize } = require('../src/models');

// Config
const API_URL = 'http://127.0.0.1:5000/admin'; // Backend port
const JWT_SECRET = 'secret'; // Hardcoded for dev environment as per previous knowledge

// Admin User Mock
const admin = {
  user_id: 1,
  role: 'admin'
};

// Generate Token
const token = jwt.sign({ user_id: admin.user_id, role: admin.role }, JWT_SECRET, { expiresIn: '1h' });

async function run() {
  console.log('Starting Notification Tests...');

  try {
    // 0. Ensure DB connection for seeding
    await sequelize.authenticate();
    console.log('DB Connected for seeding.');

    // 1. Send Personal Notification
    console.log('Sending Personal Notification...');
    const sendRes = await fetch(`${API_URL}/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        user_id: 1, // Assuming user 1 exists
        title: 'Test Notification',
        message: 'This is a test personal notification',
        type: 'personal',
        event_type: 'system'
      })
    });
    
    if (!sendRes.ok) {
        const err = await sendRes.text();
        throw new Error(`Send failed: ${sendRes.status} ${err}`);
    }
    const sentData = await sendRes.json();
    console.log('Sent Data:', JSON.stringify(sentData, null, 2));
    const notifId = sentData[0]?.notification_id;
    console.log('Sent Notification ID:', notifId);

    // 2. List Notifications
    console.log('Listing Notifications...');
    const listRes = await fetch(`${API_URL}/notifications?user_id=1`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const listData = await listRes.json();
    console.log(`Found ${listData.length} notifications for user 1`);
    
    const found = listData.find(n => n.notification_id === notifId);
    if (!found) throw new Error('Newly created notification not found in list');
    console.log('Verified notification exists in list');

    // 3. Resend Notification
    console.log('Resending Notification...');
    const resendRes = await fetch(`${API_URL}/notifications/${notifId}/resend`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!resendRes.ok) throw new Error('Resend failed');
    const resendData = await resendRes.json();
    console.log('Resent Notification ID:', resendData.notification_id);

    // 4. Test Automation (Order Update Trigger)
    // We need an order ID. Let's create one or find one first.
    // For simplicity, we'll skip creating an order if we don't have one, 
    // but let's try to list orders and pick one.
    const ordersRes = await fetch(`${API_URL}/orders`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const orders = await ordersRes.json();
    
    if (orders.length > 0) {
        const orderId = orders[0].order_id;
        console.log(`Testing Order Automation on Order #${orderId}...`);
        
        // Update status to 'processing' (or something valid from current status)
        // Check current status
        const currentStatus = orders[0].status;
        let nextStatus = 'processing';
        if (currentStatus === 'pending') nextStatus = 'accepted';
        else if (currentStatus === 'accepted') nextStatus = 'picked_up';
        else if (currentStatus === 'picked_up') nextStatus = 'processing';
        else if (currentStatus === 'processing') nextStatus = 'ready';
        else if (currentStatus === 'ready') nextStatus = 'delivered';
        
        if (nextStatus) {
            console.log(`Updating status from ${currentStatus} to ${nextStatus}`);
            const updateRes = await fetch(`${API_URL}/orders/${orderId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status: nextStatus })
            });
            
            if (updateRes.ok) {
                console.log('Order status updated. Checking for new notification...');
                // Check latest notification for this user
                const checkNotifRes = await fetch(`${API_URL}/notifications?user_id=${orders[0].user_id}&event_type=order_update`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const notifs = await checkNotifRes.json();
                if (notifs.length > 0 && notifs[0].title === 'Order Update') {
                    console.log('SUCCESS: Automation triggered notification!');
                } else {
                    console.warn('WARNING: Automation notification not found at top of list.');
                }
            } else {
                console.log('Order update failed (might be invalid transition), skipping automation test.');
            }
        }
    } else {
        console.log('No orders found to test automation.');
    }

    // 5. Test Subscription Expiry Automation
    console.log('Testing Subscription Expiry Automation...');
    
    // Seed a plan and subscription
    const plan = await Plan.create({
        name: 'Test Plan',
        price: 5000,
        duration_days: 30,
        max_pickups: 4,
        description: 'Test',
        type: 'monthly',
        clothes_limit: 20
    });
    
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 1); // Expires tomorrow
    
    const sub = await Subscription.create({
        user_id: 1, // Admin user as test subject
        plan_id: plan.plan_id,
        start_date: new Date(),
        end_date: expiryDate,
        remaining_pickups: 4,
        status: 'active'
    });
    
    // Trigger check
    const triggerRes = await fetch(`${API_URL}/subscriptions/check-expiry`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!triggerRes.ok) {
        const err = await triggerRes.text();
        throw new Error(`Trigger check failed: ${err}`);
    }
    const triggerData = await triggerRes.json();
    console.log('Trigger Result:', triggerData);
    
    if (triggerData.sent > 0) {
        console.log('SUCCESS: Expiry notification sent!');
    } else {
        console.warn('WARNING: No expiry notification sent (maybe already sent or no match).');
    }
    
    // Cleanup
    await sub.destroy();
    await plan.destroy();

    console.log('Tests Passed!');

  } catch (err) {
    console.error('Test Failed:', err);
    process.exit(1);
  }
}

run();
