const axios = require('axios');
const jwt = require('jsonwebtoken');
const { User } = require('./src/models');

const BASE_URL = 'http://localhost:5000';
const JWT_SECRET = 'secret'; // Default from auth.js

function generateToken(user) {
    if (!user) return null;
    return jwt.sign({ user_id: user.user_id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
}

async function getRealToken(role) {
    const user = await User.findOne({ where: { role } });
    if (!user) {
        console.warn(`   WARNING: No user found with role '${role}'. Using fake ID 9999 (expect 401).`);
        return generateToken({ user_id: 9999, role });
    }
    return generateToken(user);
}

async function test() {
    try {
        console.log('--- Starting Bolt-Grade Chat Verification (Token Bypass + Real DB Users) ---');

        // 1. Generate Tokens
        console.log('\n1. Generating Tokens...');
        const adminToken = await getRealToken('admin');
        const washerToken = await getRealToken('washer');
        const recepToken = await getRealToken('receptionist');
        
        console.log('   Tokens generated.');

        // 4. Test Admin Access to Chats (Read Only - but endpoint returns list)
        console.log('\n4. Testing Admin Access to GET /admin/chats...');
        try {
            const adminChats = await axios.get(`${BASE_URL}/admin/chats`, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            console.log(`   Success. Admin sees ${adminChats.data.length} chats.`);
            // Check structure
            if (adminChats.data.length > 0) {
                const chat = adminChats.data[0];
                console.log('   Chat Structure Check:', Object.keys(chat));
                if (chat.lastMessage) console.log('   Last Message:', chat.lastMessage);
            }
        } catch (e) {
            console.error('   FAILED:', e.response?.data || e.message);
        }

        // 5. Test Washer Access to Chats (Should be BLOCKED)
        console.log('\n5. Testing Washer Access to GET /admin/chats (Should fail 403)...');
        try {
            await axios.get(`${BASE_URL}/admin/chats`, {
                headers: { Authorization: `Bearer ${washerToken}` }
            });
            console.error('   FAILED: Washer was able to access chats!');
        } catch (e) {
            if (e.response?.status === 403) {
                console.log('   Success. Washer blocked (403 Forbidden).');
            } else {
                console.error('   Unexpected error:', e.message);
            }
        }

        // 6. Test Receptionist Access to Chats (Should be BLOCKED)
        console.log('\n6. Testing Receptionist Access to GET /admin/chats (Should fail 403)...');
        try {
            await axios.get(`${BASE_URL}/admin/chats`, {
                headers: { Authorization: `Bearer ${recepToken}` }
            });
            console.error('   FAILED: Receptionist was able to access chats!');
        } catch (e) {
            if (e.response?.status === 403) {
                console.log('   Success. Receptionist blocked (403 Forbidden).');
            } else {
                console.error('   Unexpected error:', e.message);
            }
        }

        console.log('\n--- Verification Complete ---');

    } catch (error) {
        console.error('Test Failed:', error.message);
        if (error.response) console.error('Response:', error.response.data);
    }
}

test();
