const axios = require('axios');
const { Sequelize } = require('sequelize');

const BASE_URL = 'http://localhost:5000';
const ADMIN_PHONE = '09999999998'; // New Admin to avoid suspension
const ADMIN_PASS = 'admin123';

// 1. Login or Register as Admin
async function run() {
    console.log('--- STARTING REPRODUCTION SCRIPT ---');
    
    let adminToken;
    try {
        console.log('1. Logging/Registering as Admin...');
        // Try login first
        try {
             const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
                 phone_number: ADMIN_PHONE,
                 password: ADMIN_PASS
             });
             adminToken = loginRes.data.token;
             console.log('   Admin logged in successfully.');
        } catch (e) {
             // Register if not found or failed
             console.log('   Admin login failed, registering new admin...');
             const regRes = await axios.post(`${BASE_URL}/auth/register`, {
                 full_name: 'Test Admin',
                 email: 'admin_test@example.com',
                 phone_number: ADMIN_PHONE,
                 password: ADMIN_PASS,
                 role: 'admin'
             });
             adminToken = regRes.data.token;
             console.log('   Admin registered successfully.');
        }
    } catch (e) {
        console.error('   FAILED to login/register as admin:', e.response ? e.response.data : e.message);
        process.exit(1);
    }

    // 2. Create a Washer (if not exists)
    let washerToken;
    const washerPhone = '08116201121'; // Fixed phone for reproducibility
    try {
        console.log('2. Creating/Finding Washer...');
        // Try login first
        try {
             const washerLogin = await axios.post(`${BASE_URL}/auth/login`, {
                 phone_number: washerPhone,
                 password: 'password123'
             });
             washerToken = washerLogin.data.token;
             console.log('   Washer logged in.');
        } catch (e) {
            console.log('   Washer login failed (maybe wrong password or not exists). Checking existence...');
            
            // Get all users to find ID
            const usersRes = await axios.get(`${BASE_URL}/admin/users`, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            const existingUser = usersRes.data.find(u => u.phone_number === washerPhone);
            
            if (existingUser) {
                console.log(`   Washer exists (ID: ${existingUser.user_id}), updating password...`);
                await axios.put(`${BASE_URL}/admin/users/${existingUser.user_id}`, {
                    password: 'password123'
                }, { headers: { Authorization: `Bearer ${adminToken}` } });
                console.log('   Password updated.');
            } else {
                console.log('   Washer not found, creating...');
                await axios.post(`${BASE_URL}/api/staff`, {
                    full_name: 'Test Washer',
                    phone_number: washerPhone,
                    role: 'washer',
                    password: 'password123'
                }, { headers: { Authorization: `Bearer ${adminToken}` } });
                console.log('   Washer created.');
            }
            
            // Login again
            const washerLogin = await axios.post(`${BASE_URL}/auth/login`, {
                phone_number: washerPhone,
                password: 'password123'
            });
            washerToken = washerLogin.data.token;
            console.log('   Washer logged in successfully.');
        }
    } catch (e) {
        console.error('   FAILED to setup Washer:', e.message);
        if (e.response) console.error('   Response:', e.response.data);
        process.exit(1);
    }

    // 3. Create an Order (as Admin)
    let orderId;
    try {
        console.log('3. Creating an Order (as Admin)...');
        const orderRes = await axios.post(`${BASE_URL}/admin/orders`, {
            user_id: 1, // Assuming user 1 exists
            pickup_date: '2026-02-15',
            pickup_time: '10:00 AM',
            clothes_count: 10,
            pickup_address: 'Test Addr'
        }, { headers: { Authorization: `Bearer ${adminToken}` } });
        orderId = orderRes.data.order_id;
        console.log(`   Order created: #${orderId} (Status: ${orderRes.data.status})`);
    } catch (e) {
        console.error('   FAILED to create order:', e.response ? e.response.data : e.message);
        process.exit(1);
    }

    // 4. Update Status to Processing (as Admin)
    try {
        console.log('4. Moving Order to Processing (as Admin)...');
        // Washers can only move Processing -> Ready. So Admin must move Pending -> Processing first.
        // But wait, Pending -> Accepted -> PickedUp -> Processing?
        // Or directly? Admin can do anything.
        await axios.put(`${BASE_URL}/admin/orders/${orderId}/status`, {
            status: 'processing'
        }, { headers: { Authorization: `Bearer ${adminToken}` } });
        console.log('   Order status set to processing.');
    } catch (e) {
        console.error('   FAILED to update status to processing:', e.response ? e.response.data : e.message);
        process.exit(1);
    }

    // 5. Washer Fetches Orders
    let targetOrder;
    try {
        console.log('5. Fetching Orders as Washer...');
        const ordersRes = await axios.get(`${BASE_URL}/admin/orders?status=processing`, {
            headers: { Authorization: `Bearer ${washerToken}` }
        });
        targetOrder = ordersRes.data.find(o => o.order_id === orderId);
        if (!targetOrder) {
            console.error('   FAILED: Washer cannot see the order.');
            process.exit(1);
        }
        console.log(`   Washer sees order #${targetOrder.order_id} with version ${targetOrder.version}`);
    } catch (e) {
        console.error('   FAILED to fetch orders:', e.message);
        process.exit(1);
    }

    // 6. Washer Updates Status to Ready (Simulating Frontend)
    console.log('6. Washer attempting to Mark Ready...');
    try {
        const updateRes = await axios.put(`${BASE_URL}/admin/orders/${orderId}/status`, {
            status: 'ready',
            version: targetOrder.version
        }, { headers: { Authorization: `Bearer ${washerToken}` } });
        console.log('   SUCCESS: Order updated to ready.');
        console.log('   Response:', updateRes.data);
    } catch (e) {
        console.error('   FAILED to Mark Ready:', e.response ? e.response.data : e.message);
        process.exit(1);
    }

    // 7. Verify Final State
    try {
        console.log('7. Verifying final state...');
        const finalRes = await axios.get(`${BASE_URL}/admin/orders?status=ready`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const found = finalRes.data.find(o => o.order_id === orderId);
        if (found) {
            console.log('   Final check PASSED: Order is in ready list.');
        } else {
            console.error('   Final check FAILED: Order not found in ready list.');
        }
    } catch (e) {
        console.error('   FAILED to verify final state:', e.message);
    }
}

run();
