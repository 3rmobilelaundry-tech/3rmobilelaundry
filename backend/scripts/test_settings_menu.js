const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const BASE_URL = 'http://localhost:5000';

async function testSettings() {
    try {
        console.log('1. Logging in as Admin...');
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            phone_number: '09000000000', 
            password: 'admin123'
        });
        const token = loginRes.data.token;
        const headers = { Authorization: `Bearer ${token}` };
        console.log('Login successful.');

        console.log('2. Fetching Settings...');
        const getRes = await axios.get(`${BASE_URL}/admin/settings`, { headers });
        console.log('Current Settings:', JSON.stringify(getRes.data, null, 2));

        console.log('3. Updating Settings (Branding & Operations)...');
        const updatePayload = {
            branding: {
                app_name: '3R Laundry PRO',
                description: 'Updated Description via Test'
            },
            operations: {
                extra_item_price: 750,
                pickup_windows: [
                    { day: 'Mon', start: '08:00', end: '12:00' }
                ]
            }
        };
        const putRes = await axios.put(`${BASE_URL}/admin/settings`, updatePayload, { headers });
        console.log('Update Response:', putRes.data);

        if (putRes.data.branding.app_name !== '3R Laundry PRO' || putRes.data.operations.extra_item_price !== 750) {
            throw new Error('Settings update failed validation');
        }
        console.log('Settings updated successfully.');

        console.log('4. Testing File Upload (Mock)...');
        // Create a dummy file
        const dummyPath = path.join(__dirname, 'test_logo.png');
        fs.writeFileSync(dummyPath, 'fake png content');
        
        const form = new FormData();
        form.append('type', 'logo');
        form.append('file', fs.createReadStream(dummyPath));

        const uploadRes = await axios.post(`${BASE_URL}/admin/settings/upload`, form, {
            headers: {
                ...headers,
                ...form.getHeaders()
            }
        });
        console.log('Upload Response:', uploadRes.data);
        
        if (!uploadRes.data.url.includes('/uploads/')) {
            throw new Error('Upload failed: Invalid URL returned');
        }

        // Cleanup
        fs.unlinkSync(dummyPath);
        console.log('File upload successful.');

        console.log('ALL TESTS PASSED');

    } catch (error) {
        console.error('TEST FAILED:', error.response ? error.response.data : error.message);
    }
}

testSettings();
