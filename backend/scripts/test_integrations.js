const jwt = require('jsonwebtoken');

const API_URL = 'http://127.0.0.1:5000/admin';
const JWT_SECRET = 'secret'; // Assuming this is the secret used in dev

const admin = { user_id: 1, role: 'admin' };
const token = jwt.sign(admin, JWT_SECRET, { expiresIn: '1h' });

async function testIntegrations() {
  console.log('Starting Integrations API Tests...');
  const headers = { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  try {
    // 1. GET Integrations (Defaults)
    console.log('\n1. GET /integrations');
    let res = await fetch(`${API_URL}/integrations`, { headers });
    let data = await res.json();
    console.log('Status:', res.status);
    console.log('Data:', JSON.stringify(data, null, 2));

    if (!res.ok) throw new Error(`GET failed: ${res.status}`);
    if (!data.paystack) throw new Error('Paystack config missing');
    if (!data.whatsapp) throw new Error('WhatsApp config missing');

    // 2. PUT Integrations (Update)
    console.log('\n2. PUT /integrations');
    const updateData = {
      paystack: { enabled: true, public_key: 'pk_test_123', secret_key: 'sk_test_123' },
      whatsapp: { enabled: true, api_key: 'token_123', phone_number_id: 'phone_123' },
      email: { enabled: false, smtp_host: 'smtp.gmail.com', smtp_port: 587, smtp_user: '', smtp_pass: '' }
    };
    res = await fetch(`${API_URL}/integrations`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updateData)
    });
    data = await res.json();
    console.log('Status:', res.status);
    console.log('Data:', data);

    if (!res.ok) throw new Error(`PUT failed: ${res.status}`);

    // Verify update
    res = await fetch(`${API_URL}/integrations`, { headers });
    data = await res.json();
    if (!data.paystack.enabled) throw new Error('Paystack not enabled after update');
    if (data.paystack.public_key !== 'pk_test_123') throw new Error('Paystack key not updated');

    // 3. Test Connection (Mock)
    console.log('\n3. POST /integrations/test/paystack');
    res = await fetch(`${API_URL}/integrations/test/paystack`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        public_key: 'pk_test_123',
        secret_key: 'sk_test_123'
      })
    });
    data = await res.json();
    console.log('Status:', res.status);
    console.log('Data:', data);

    if (data.status !== 'success') throw new Error('Paystack test failed');

    // 4. Test WhatsApp Mock
    console.log('\n4. POST /integrations/test/whatsapp');
    res = await fetch(`${API_URL}/integrations/test/whatsapp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        api_key: 'token_123',
        phone_number_id: 'phone_123'
      })
    });
    data = await res.json();
    console.log('Status:', res.status);
    console.log('Data:', data);
    
    if (data.status !== 'success') throw new Error('WhatsApp test failed');

    console.log('\nALL INTEGRATION TESTS PASSED');

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testIntegrations();
