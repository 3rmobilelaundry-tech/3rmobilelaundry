// const fetch = require('node-fetch'); // Assuming node-fetch is available or using built-in fetch in newer node
// If node-fetch not available, we use global fetch (Node 18+)
// We'll use a wrapper.

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
    console.log('--- SECURITY FEATURE TEST ---');
    
    const testPhone = '09999999999';
    const testPass = 'password123';
    
    // 1. Register User
    console.log('\n1. Registering Test User...');
    let res = await request('POST', '/auth/register', {
        full_name: 'Security Test User',
        phone_number: testPhone,
        password: testPass,
        role: 'student'
    });
    
    if (res.status === 201 || res.data.message === 'User created successfully') {
        console.log('User registered.');
    } else if (res.data.error === 'Phone number already registered' || (res.data.error && res.data.error.includes('Validation error'))) {
        console.log('User already exists (ok).');
    } else {
        console.error('Registration failed:', res.data);
        return;
    }
    
    // 2. Fail Login 3 Times
    console.log('\n2. Attempting 3 Failed Logins...');
    for (let i = 1; i <= 3; i++) {
        res = await request('POST', '/auth/login', {
            phone_number: testPhone,
            password: 'wrongpassword'
        });
        console.log(`Attempt ${i}: Status ${res.status} (Expected 401)`);
    }
    
    // 3. Login as Admin
    console.log('\n3. Logging in as Admin...');
    res = await request('POST', '/auth/login', {
        phone_number: '09000000000', // Demo Admin
        password: 'admin123'
    });
    
    if (res.status !== 200) {
        console.error('Admin login failed:', res.data);
        return;
    }
    const adminToken = res.data.token;
    console.log('Admin logged in.');
    
    // 4. Check Flagged Users
    console.log('\n4. Checking Flagged Users...');
    res = await request('GET', '/admin/security/flagged-users', null, adminToken);
    const flagged = res.data;
    console.log(`Found ${flagged.length} flagged users.`);
    
    const target = flagged.find(u => u.phone_number === testPhone);
    if (target) {
        console.log('SUCCESS: Test user is flagged!');
        console.log(`Reason: ${target.flag_reason}`);
        console.log(`Failed Attempts: ${target.failed_login_attempts}`);
        
        // 5. Unflag User
        console.log('\n5. Unflagging User...');
        res = await request('POST', `/admin/security/users/${target.user_id}/unflag`, null, adminToken);
        if (res.status === 200) {
            console.log('User unflagged successfully.');
        } else {
            console.error('Unflag failed:', res.data);
        }
        
        // 6. Verify Unflag
        res = await request('GET', '/admin/security/flagged-users', null, adminToken);
        if (!res.data.find(u => u.phone_number === testPhone)) {
            console.log('SUCCESS: User is no longer flagged.');
        } else {
            console.error('FAILURE: User is still flagged.');
        }
        
    } else {
        console.error('FAILURE: Test user was NOT flagged.');
    }
    
    // 7. Check Logs
    console.log('\n6. Checking Security Logs...');
    res = await request('GET', '/admin/security/logs?limit=5', null, adminToken);
    if (res.data && res.data.length > 0) {
        console.log('Recent Logs:');
        res.data.forEach(log => {
            console.log(`- [${log.action}] ${log.details}`);
        });
    } else {
        console.log('No logs found.');
    }
}

runTest();
