const API_URL = 'http://localhost:5000';
const WEBHOOK_URL = 'http://localhost:5000/webhooks/paystack';

// Use global fetch
const request = fetch;

async function testWebhooks() {
  console.log('Starting Webhook Tests...');
  
  // Mock Paystack Charge Success Event
  const payload = {
    event: 'charge.success',
    data: {
      reference: 'ref_' + Date.now(),
      amount: 500000, // 5000.00
      customer: {
        email: 'test_webhook@example.com'
      },
      metadata: {
        type: 'subscription',
        subscription_id: 1 // Assuming ID 1 exists or will be ignored but 200 OK
      }
    }
  };

  try {
    console.log('\n1. POST /webhooks/paystack (charge.success)');
    // Calculate signature if we implemented signature verification, but we didn't yet.
    // If we did, we'd need crypto.
    
    let res = await request(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    console.log('Status:', res.status);
    if (res.status === 200) {
      console.log('Webhook delivered successfully');
    } else {
      console.error('Webhook failed');
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testWebhooks();