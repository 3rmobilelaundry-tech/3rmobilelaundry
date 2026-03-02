const { Sequelize } = require('sequelize');
const { User, Order, Payment, Subscription, Plan, AnalyticsSnapshot, sequelize } = require('../src/models');
const jwt = require('jsonwebtoken');

const API_URL = 'http://127.0.0.1:5000/admin';
const JWT_SECRET = 'secret'; 

const admin = { user_id: 1, role: 'admin' };
const token = jwt.sign(admin, JWT_SECRET, { expiresIn: '1h' });

async function run() {
  console.log('Starting Analysis API Tests... (v2)');

  try {
    await sequelize.authenticate();
    // Authenticate as Admin
    console.log('Authenticating...');

    try {
        await sequelize.query("ALTER TABLE Payments ADD COLUMN gateway TEXT;");
        console.log("Added gateway column to Payments");
    } catch (e) {}
    try {
        await sequelize.query("ALTER TABLE Payments ADD COLUMN payment_type TEXT;");
        console.log("Added payment_type column to Payments");
    } catch (e) {}

    // 1. Setup Mock Data
    console.log('Setting up mock data...');
    
    // Plan
    const [plan] = await Plan.findOrCreate({
        where: { name: 'Premium Plan' },
        defaults: { price: 5000, duration_days: 30, max_clothes: 20 }
    });

    // User
    const [user] = await User.findOrCreate({
        where: { phone_number: '0000008888' },
        defaults: { full_name: 'Analysis User', password: 'hash', role: 'student', school: 'UNILAG' }
    });

    // Subscription
    const [sub] = await Subscription.findOrCreate({
        where: { user_id: user.user_id },
        defaults: {
            plan_id: plan.plan_id,
            start_date: new Date(),
            end_date: new Date(Date.now() + 30*24*60*60*1000),
            status: 'active',
            remaining_pickups: 4
        }
    });

    // Payment
    await Payment.create({
        user_id: user.user_id,
        amount: 5000,
        payment_type: 'subscription',
        status: 'paid',
        gateway: 'paystack'
    });

    // Order (Delivered)
    await Order.create({
        user_id: user.user_id,
        status: 'delivered',
        pickup_date: new Date(),
        pickup_time: '10:00 AM',
        completed_at: new Date(Date.now() + 3600000), // 1 hour later
        created_at: new Date()
    });

    // 2. Test GET /analysis
    console.log('Test 2: GET /analysis');
    const res = await fetch(`${API_URL}/analysis?period=daily`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`GET /analysis failed: ${res.status} ${txt}`);
    }

    const data = await res.json();
    console.log('Analysis Data:', JSON.stringify(data, null, 2));

    // Assertions
    if (data.total_orders < 1) throw new Error('Total orders should be >= 1');
    if (data.completion_rate <= 0) throw new Error('Completion rate should be > 0');
    if (data.revenue_by_school.length === 0) throw new Error('Revenue by school missing');
    if (data.popular_plans.length === 0) throw new Error('Popular plans missing');

    // 3. Test Snapshot Creation (Automation)
    console.log('Test 3: Verify Snapshot Created');
    const snapshot = await AnalyticsSnapshot.findOne({
        where: { period_type: 'daily' },
        order: [['created_at', 'DESC']]
    });
    if (!snapshot) throw new Error('Snapshot was not created automatically');
    console.log('Snapshot found:', snapshot.snapshot_id);

    // 4. Test GET /analysis/reports
    console.log('Test 4: GET /analysis/reports');
    const repRes = await fetch(`${API_URL}/analysis/reports?type=daily`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const reports = await repRes.json();
    if (reports.length === 0) throw new Error('Reports list empty');
    console.log('Reports fetched:', reports.length);

    console.log('All Analysis Tests Passed!');

    // Cleanup (optional, keeping data for manual check is fine)
    // await Payment.destroy({ where: { user_id: user.user_id } });
    // await Order.destroy({ where: { user_id: user.user_id } });
    // await Subscription.destroy({ where: { user_id: user.user_id } });

  } catch (err) {
    console.error('Test Failed:', err);
    process.exit(1);
  }
}

run();
