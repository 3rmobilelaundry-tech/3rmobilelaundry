const { User, UserDeviceToken } = require('../src/models');
const bcrypt = require('bcryptjs');

const BASE_URL = 'http://localhost:5000';

async function runTest() {
  try {
    console.log("1. Setting up user...");
    let user = await User.findOne({ where: { email: 'devicetest@example.com' } });
    if (!user) {
      const hash = await bcrypt.hash('password123', 10);
      user = await User.create({
        full_name: 'Device Tester',
        email: 'devicetest@example.com',
        phone_number: '08100000005',
        password: hash,
        role: 'student',
        email_verified: true
      });
    }

    console.log("2. Logging in...");
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: '08100000005', password: 'password123' })
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok) throw new Error("Login failed: " + JSON.stringify(loginData));
    
    const token = loginData.token;
    console.log("Token obtained.");

    console.log("3. Registering device...");
    const regRes = await fetch(`${BASE_URL}/api/device/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ fcmToken: 'REAL_DEVICE_TOKEN_123', deviceType: 'android' })
    });
    const regData = await regRes.json();
    console.log("Register response:", regRes.status, regData);

    console.log("4. Testing my-devices endpoint...");
    const testRes = await fetch(`${BASE_URL}/api/device/test`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const testData = await testRes.json();
    console.log("My devices response:", testRes.status, JSON.stringify(testData, null, 2));

    const dbDevices = await UserDeviceToken.findAll({
      where: { user_id: user.user_id }
    });
    console.log("Database rows:", dbDevices.map((device) => ({
      user_id: device.user_id,
      fcm_token: device.fcm_token,
      device_type: device.device_type
    })));

    if (
      testData.devices &&
      testData.devices.find(d => d.fcm_token === 'REAL_DEVICE_TOKEN_123') &&
      dbDevices.find(d => d.fcm_token === 'REAL_DEVICE_TOKEN_123')
    ) {
      console.log("✅ SUCCESS: Token saved correctly to the database.");
    } else {
      console.error("❌ FAILURE: Token not found in database.");
    }
  } catch (err) {
    console.error("Test failed:", err.message);
  }
}

runTest();
