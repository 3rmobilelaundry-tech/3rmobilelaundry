const http = require('http');
const BASE = process.env.BASE || 'http://localhost:5100';
function req(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(path, BASE);
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
    };
    const r = http.request(url, opts, (res) => {
      let buf = '';
      res.on('data', (d) => (buf += d));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: buf ? JSON.parse(buf) : {} });
        } catch (e) {
          reject(e);
        }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
async function run() {
  let res = await req('POST', '/auth/register', { full_name: 'Admin2', phone_number: '09000000001', password: 'admin2', role: 'admin' });
  if (![200,201].includes(res.status)) throw new Error('register admin failed');
  res = await req('POST', '/auth/login', { phone_number: '09000000001', password: 'admin2' });
  if (res.status !== 200) throw new Error('login admin failed');
  const token = res.json.token;
  const headers = { Authorization: `Bearer ${token}` };
  res = await req('POST', '/admin/plans', { name: 'Gold', price: 30000, duration_days: 30, max_pickups: 16, description: 'Gold tier' }, headers);
  if (res.status !== 201) throw new Error('create plan failed');
  const planId = res.json.plan_id;
  res = await req('GET', '/admin/plans', null, headers);
  if (res.status !== 200 || !Array.isArray(res.json)) throw new Error('list plans failed');
  res = await req('PUT', `/admin/plans/${planId}`, { price: 32000 }, headers);
  if (res.status !== 200 || res.json.price !== 32000) throw new Error('update plan failed');
  res = await req('DELETE', `/admin/plans/${planId}`, null, headers);
  if (res.status !== 200) throw new Error('delete plan failed');
  console.log('Plan CRUD smoke passed.');
}
run().catch((e) => { console.error('Plan tests failed:', e.message || e); process.exit(1); });
