const BASE_URL = process.env.BASE_URL || 'http://localhost:5001';

async function verifyOverview() {
  try {
    console.log('Logging in as Admin...');
    const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            phone_number: '09000000000',
            password: 'admin123'
        })
    });

    if (!loginResponse.ok) {
        throw new Error(`Login failed! status: ${loginResponse.status}`);
    }

    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log('Login successful, token received.');

    console.log('Fetching Overview data...');
    const response = await fetch(`${BASE_URL}/admin/overview`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    console.log('Overview Data Received:');
    console.log(JSON.stringify(data, null, 2));

    // Basic validation
    if (data.users === undefined || data.orders === undefined || data.revenue === undefined) {
      console.error('FAILED: Missing required fields in response');
      process.exit(1);
    }

    console.log('Overview endpoint OK.');

    console.log('Fetching Sync Pull data...');
    const syncResponse = await fetch(`${BASE_URL}/admin/sync/pull?entity_type=sync_event`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    if (!syncResponse.ok) {
        throw new Error(`Sync pull failed! status: ${syncResponse.status}`);
    }
    const syncData = await syncResponse.json();
    if (!Array.isArray(syncData.items)) {
      console.error('FAILED: Sync pull missing items array');
      process.exit(1);
    }
    console.log('Sync pull endpoint OK.');

    console.log('SUCCESS: Admin overview + sync pull verified.');
  } catch (error) {
    console.error('Error fetching overview:', error.message);
    if (error.cause) {
        console.error('Cause:', error.cause);
    }
    if (error.message.includes('fetch failed')) {
        console.error('FAILED: Backend server is likely not running or connection refused.');
    }
    process.exit(1);
  }
}

verifyOverview();
