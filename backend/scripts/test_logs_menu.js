
const API_URL = 'http://localhost:5000';

async function request(method, endpoint, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const options = {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    };
    
    const res = await fetch(`${API_URL}${endpoint}`, options);
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
}

async function runTest() {
    console.log('--- LOGS MENU TEST ---');
    
    // 1. Login as Admin
    console.log('\n1. Login as Admin...');
    let res = await request('POST', '/auth/login', {
        phone_number: '09000000000',
        password: 'admin123'
    });
    
    if (res.status !== 200) {
        console.error('Admin login failed:', res.data);
        return;
    }
    const token = res.data.token;
    console.log('Admin logged in.');

    // 2. Trigger User Log (Create User)
    const testUserPhone = '09888888888';
    console.log('\n2. Triggering User Log (Create User)...');
    
    // Cleanup if exists
    const usersRes = await request('GET', '/admin/users', null, token);
    const existing = usersRes.data.find(u => u.phone_number === testUserPhone);
    if (existing) {
        await request('DELETE', `/admin/users/${existing.user_id}`, null, token);
    }

    res = await request('POST', '/admin/users', {
        full_name: 'Log Test User',
        phone_number: testUserPhone,
        password: 'password123',
        role: 'student'
    }, token);
    
    if (res.status === 201) {
        console.log('User created (should trigger CREATE_USER log).');
    } else {
        console.error('Create user failed:', res.data);
    }

    // 3. Trigger Payment Log (Create Payment)
    console.log('\n3. Triggering Payment Log (Create Payment)...');
    // We need a user ID for payment. Use the one we just created or the admin.
    // Let's use the admin ID for simplicity or fetch the created user.
    // If create user failed, we use admin.
    let targetUserId = res.data.user_id; 
    if (!targetUserId) {
         // Fallback to finding admin id
         const profile = await request('GET', '/auth/profile', null, token);
         targetUserId = profile.data.user_id;
    }

    res = await request('POST', '/admin/payments', {
        user_id: targetUserId,
        amount: 5000,
        payment_type: 'topup',
        gateway: 'cash',
        status: 'completed',
        reference: 'LOG_TEST_' + Date.now()
    }, token);
    
    if (res.status === 200) {
        console.log('Payment created (should trigger CREATE_PAYMENT log).');
    } else {
        console.error('Create payment failed:', res.data);
    }

    // 4. Verify Logs
    console.log('\n4. Verifying Logs...');
    
    // Check User Logs
    console.log('Fetching User Logs...');
    res = await request('GET', '/admin/audit-logs?entity_type=user&limit=5', null, token);
    const userLogs = res.data;
    const userLogFound = userLogs.find(l => l.action === 'CREATE_USER' && l.details.includes('student'));
    
    if (userLogFound) {
        console.log('SUCCESS: Found CREATE_USER log.');
    } else {
        console.error('FAILURE: CREATE_USER log not found.');
    }

    // Check Payment Logs
    console.log('Fetching Payment Logs...');
    res = await request('GET', '/admin/audit-logs?entity_type=payment&limit=5', null, token);
    const paymentLogs = res.data;
    const paymentLogFound = paymentLogs.find(l => l.action === 'CREATE_PAYMENT' && l.details.includes('5000'));
    
    if (paymentLogFound) {
        console.log('SUCCESS: Found CREATE_PAYMENT log.');
    } else {
        console.error('FAILURE: CREATE_PAYMENT log not found.');
    }

    // Check All Logs
    console.log('Fetching All Logs...');
    res = await request('GET', '/admin/audit-logs?limit=5', null, token);
    if (res.data.length > 0) {
        console.log(`SUCCESS: Retrieved ${res.data.length} logs.`);
    } else {
        console.warn('WARNING: No logs found at all?');
    }
}

runTest();
