const axios = require('axios');
const { User, Order, Code, sequelize } = require('./src/models');
const bcrypt = require('bcryptjs');

const BASE_URL = 'http://localhost:5000'; 

// Helper to login
async function login(phone, password) {
    try {
        const res = await axios.post(`${BASE_URL}/auth/login`, {
            phone_number: phone,
            password: password
        });
        return res.data.token;
    } catch (e) {
        console.error('Login failed:', e.response?.data || e.message);
        throw e;
    }
}

async function run() {
    try {
        console.log('Starting Rider Verification...');

        // 0. Ensure Admin Exists & Password is Known
        const adminPhone = '0000000000';
        let adminUser = await User.findOne({ where: { phone_number: adminPhone } });
        const hashedAdminPass = await bcrypt.hash('admin123', 10);
        
        if (!adminUser) {
            console.log('Creating Admin user...');
            adminUser = await User.create({
                full_name: 'Head Admin',
                phone_number: adminPhone,
                password: hashedAdminPass,
                role: 'admin',
                status: 'active'
            });
        } else {
            // Update password to ensure we can login
            console.log('Updating Admin password to ensure access...');
            adminUser.password = hashedAdminPass;
            await adminUser.save();
        }

        // 1. Login as Admin to setup
        console.log('Logging in as Admin...');
        const adminToken = await login('0000000000', 'admin123');
        console.log('Admin logged in.');

        // 2. Create Rider User
        const riderPhone = '9999999999';
        let riderUser = await User.findOne({ where: { phone_number: riderPhone } });
        if (!riderUser) {
            console.log('Creating Rider user...');
            // admin routes are mounted at /admin
            await axios.post(`${BASE_URL}/admin/staff`, {
                full_name: 'Test Rider',
                phone_number: riderPhone,
                password: 'rider123',
                role: 'rider',
                status: 'active'
            }, { headers: { Authorization: `Bearer ${adminToken}` } });
        } else {
            // Reset rider password just in case
             const hashedRiderPass = await bcrypt.hash('rider123', 10);
             riderUser.password = hashedRiderPass;
             await riderUser.save();
        }

        // 3. Login as Rider
        console.log('Logging in as Rider...');
        const riderToken = await login('9999999999', 'rider123');
        console.log('Rider logged in.');

        // 4. Verify Permissions

        // 4a. Access Dashboard Stats (GET /orders) -> Should Succeed
        try {
            await axios.get(`${BASE_URL}/admin/orders`, { headers: { Authorization: `Bearer ${riderToken}` } });
            console.log('SUCCESS: Rider accessed /orders');
        } catch (e) {
            console.error('FAILED: Rider could not access /orders', e.message);
        }

        // 4b. Access Payments (GET /payments) -> Should Fail
        try {
            await axios.get(`${BASE_URL}/admin/payments`, { headers: { Authorization: `Bearer ${riderToken}` } });
            console.error('FAILED: Rider accessed /payments (SHOULD BE BLOCKED)');
        } catch (e) {
            if (e.response?.status === 403) {
                console.log('SUCCESS: Rider blocked from /payments (403)');
            } else {
                console.error('FAILED: Rider blocked with unexpected status', e.response?.status);
            }
        }

        // 4c. Access Subscriptions (GET /subscriptions) -> Should Fail
        try {
            await axios.get(`${BASE_URL}/admin/subscriptions`, { headers: { Authorization: `Bearer ${riderToken}` } });
            console.error('FAILED: Rider accessed /subscriptions (SHOULD BE BLOCKED)');
        } catch (e) {
            if (e.response?.status === 403) {
                console.log('SUCCESS: Rider blocked from /subscriptions (403)');
            } else {
                console.error('FAILED: Rider blocked with unexpected status', e.response?.status);
            }
        }

        // 5. Verify Code Flow
        console.log('Verifying Code Flow...');
        
        // Setup: Create an order and a pickup code (as Admin/System)
        const order = await Order.create({
            user_id: adminUser.user_id, // valid user
            status: 'accepted',
            total_amount: 1000,
            payment_status: 'paid',
            pickup_date: new Date(),
            pickup_time: '10:00',
            clothes_count: 5
        });

        const codeVal = '123456' + Math.floor(Math.random() * 1000);
        await Code.create({
            order_id: order.order_id,
            code_value: codeVal,
            type: 'pickup',
            status: 'active',
            expires_at: new Date(Date.now() + 100000)
        });

        // 5a. Rider enters Pickup Code
        try {
            const res = await axios.post(`${BASE_URL}/admin/codes/verify`, {
                code_value: codeVal
            }, { headers: { Authorization: `Bearer ${riderToken}` } });
            
            if (res.data.success && res.data.order.status === 'picked_up') {
                console.log('SUCCESS: Rider picked up order via code');
            } else {
                console.error('FAILED: Rider code verification returned unexpected result', res.data);
            }
        } catch (e) {
            console.error('FAILED: Rider code verification failed', e.response?.data || e.message);
        }

        console.log('Verification Complete.');
        process.exit(0);

    } catch (e) {
        console.error('Verification Script Failed:', e);
        process.exit(1);
    }
}

run();
