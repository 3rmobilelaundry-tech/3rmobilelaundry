const jwt = require('jsonwebtoken');
const { Sequelize, DataTypes } = require('sequelize');
const { User, Order, Code, AuditLog, sequelize } = require('../src/models');

// Config
const API_URL = 'http://127.0.0.1:5000/admin';
const JWT_SECRET = 'secret'; // Hardcoded for dev environment

// Admin User Mock
const admin = {
  user_id: 1,
  role: 'admin'
};

// Generate Token
const token = jwt.sign({ user_id: admin.user_id, role: admin.role }, JWT_SECRET, { expiresIn: '1h' });

async function run() {
  console.log('Starting Code Management Tests...');

  try {
    await sequelize.authenticate();
    console.log('DB Connected.');
    
    // Sync DB to ensure is_locked column exists
    try {
        await sequelize.query("ALTER TABLE Orders ADD COLUMN is_locked BOOLEAN DEFAULT 0");
        console.log('Added is_locked column to Orders.');
    } catch (e) {
        console.log('is_locked column likely exists or error ignored:', e.message);
    }
    console.log('DB Synced (Manual).');

    // 1. Setup Data (User & Order)
    console.log('Setting up test data...');
    // Find or create a test user
    const [user] = await User.findOrCreate({
        where: { phone_number: '0000009999' },
        defaults: {
            full_name: 'Test Code User',
            password: 'hash', // dummy
            role: 'student'
        }
    });

    // Create a pending order
    const order = await Order.create({
        user_id: user.user_id,
        pickup_date: new Date(),
        pickup_time: '10:00 AM',
        status: 'pending'
    });
    console.log(`Created Order #${order.order_id}`);

    // 2. Test: Generate Pickup Code
    console.log('Test 2: Generate Pickup Code');
    const genRes = await fetch(`${API_URL}/codes/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
            order_id: order.order_id,
            type: 'pickup'
        })
    });

    if (!genRes.ok) {
        const err = await genRes.text();
        throw new Error(`Generate failed: ${genRes.status} ${err}`);
    }
    const code1 = await genRes.json();
    console.log(`Generated Code: ${code1.code_value} (ID: ${code1.code_id})`);

    // 3. Test: List Codes
    console.log('Test 3: List Codes');
    const listRes = await fetch(`${API_URL}/codes?order_id=${order.order_id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const listData = await listRes.json();
    console.log(`Found ${listData.length} codes for order.`);
    const foundCode = listData.find(c => c.code_id === code1.code_id);
    if (!foundCode || foundCode.status !== 'active') throw new Error('Code 1 not found or not active');

    // 4. Test: Regenerate Code
    console.log('Test 4: Regenerate Code');
    const regenRes = await fetch(`${API_URL}/codes/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
            order_id: order.order_id,
            type: 'pickup',
            reason: 'User lost code'
        })
    });
    if (!regenRes.ok) {
        const err = await regenRes.text();
        throw new Error(`Regenerate failed: ${regenRes.status} ${err}`);
    }
    const code2 = await regenRes.json();
    console.log(`Regenerated Code: ${code2.code_value} (ID: ${code2.code_id})`);

    // Verify Code 1 is expired
    const checkCode1 = await Code.findByPk(code1.code_id);
    if (checkCode1.status !== 'expired') throw new Error('Old code was not expired');
    console.log('Verified old code expired.');

    // 5. Test: Invalidate Code
    console.log('Test 5: Invalidate Code (Manual)');
    const invRes = await fetch(`${API_URL}/codes/${code2.code_id}/invalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ reason: 'Security breach' })
    });
    if (!invRes.ok) throw new Error('Invalidate failed');
    
    // Verify code 2 expired
    const checkCode2 = await Code.findByPk(code2.code_id);
    if (checkCode2.status !== 'expired') throw new Error('Code 2 was not expired');
    
    // Verify Order Locked
    const checkOrder = await Order.findByPk(order.order_id);
    if (!checkOrder.is_locked) throw new Error('Order was not locked after invalidation');
    console.log('Verified order is locked.');

    // 6. Test: Audit Logs
    console.log('Test 6: Audit Logs');
    const auditRes = await fetch(`${API_URL}/codes/${code2.code_id}/audit`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const logs = await auditRes.json();
    console.log(`Found ${logs.length} audit logs for Code 2.`);
    if (logs.length === 0) throw new Error('No audit logs found');
    console.log('Audit Log Sample:', logs[0].action, logs[0].details);

    // Cleanup
    await Code.destroy({ where: { order_id: order.order_id } });
    await Order.destroy({ where: { order_id: order.order_id } });
    // User might be used by other tests, keeping it or destroying if unique enough
    // await user.destroy(); 

    console.log('All Code Management Tests Passed!');

  } catch (err) {
    console.error('Test Failed:', err);
    process.exit(1);
  }
}

run();
