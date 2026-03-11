const io = require('socket.io-client');
const axios = require('axios');

const API_URL = 'http://localhost:5000';
const SOCKET_URL = 'http://localhost:5000';

async function testChat() {
    try {
        console.log('--- Starting Chat Verification ---');

        // 1. Login as Admin to get token
        console.log('Logging in as Admin...');
        const adminLogin = await axios.post(`${API_URL}/auth/login`, {
            phone_number: '09999999998', // Updated admin phone
            password: 'password123'
        });
        const adminToken = adminLogin.data.token;
        console.log('Admin logged in.');

        // 2. Login as Washer to get token (should fail chat)
        console.log('Logging in as Washer...');
        const washerLogin = await axios.post(`${API_URL}/auth/login`, {
            phone_number: '09999999997', // Assuming washer exists
            password: 'password123'
        });
        const washerToken = washerLogin.data.token;
        console.log('Washer logged in.');

        // 3. Login as Student (User)
        // Need a valid user. Let's list users first or just use a known one.
        // Or create a dummy user? 
        // Let's assume user with ID 1 exists (from previous context).
        // Actually, let's login as a student if we have credentials, or skip user side if hard to get.
        // We can test Admin ↔ Admin for connectivity or Admin ↔ self.
        // But let's try to verify Washer restriction primarily.

        // 4. Test Washer Connection (Should Fail)
        console.log('Testing Washer Chat Access (Should Fail)...');
        const washerSocket = io(SOCKET_URL, {
            auth: { token: washerToken },
            transports: ['websocket', 'polling']
        });

        washerSocket.on('connect_error', (err) => {
            console.log('✅ Washer Connection Rejected:', err.message);
            washerSocket.disconnect();
        });

        washerSocket.on('connect', () => {
            console.error('❌ Washer Connected (Should have failed)!');
            washerSocket.disconnect();
        });

        // 5. Test Admin Connection (Should Succeed)
        console.log('Testing Admin Chat Access (Should Succeed)...');
        const adminSocket = io(SOCKET_URL, {
            auth: { token: adminToken },
            transports: ['websocket', 'polling']
        });

        adminSocket.on('connect', () => {
            console.log('✅ Admin Connected to Socket');
            
            // Join a room (Order ID 1)
            adminSocket.emit('join_room', { orderId: 1 });
        });

        adminSocket.on('error', (err) => {
            console.error('❌ Admin Socket Error:', err);
        });

        // Wait a bit
        setTimeout(() => {
            if (adminSocket.connected) {
                console.log('Closing Admin Socket...');
                adminSocket.disconnect();
            }
            console.log('--- Verification Complete ---');
        }, 3000);

    } catch (error) {
        console.error('Test Failed:', error.message);
        if (error.response) console.error('Response:', error.response.data);
    }
}

testChat();
