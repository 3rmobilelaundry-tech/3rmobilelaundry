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
  const studentPhone = `080${Math.floor(Math.random() * 90000000 + 10000000)}`;
  const adminPhone = `090${Math.floor(Math.random() * 90000000 + 10000000)}`;
  console.log('Smoke: health');
  let res = await req('GET', '/health');
  if (res.status !== 200) throw new Error('health failed');

  console.log('Smoke: register student');
  res = await req('POST', '/auth/register', { full_name: 'Student', phone_number: studentPhone, password: 'pass', role: 'student' });
  if (res.status !== 201) throw new Error('register student failed');

  console.log('Smoke: login student');
  res = await req('POST', '/auth/login', { phone_number: studentPhone, password: 'pass' });
  if (res.status !== 200) throw new Error('login student failed');
  const studentToken = res.json.token;
  const student = res.json.user;

  console.log('Smoke: list plans');
  res = await req('GET', '/student/plans');
  if (res.status !== 200 || !Array.isArray(res.json) || res.json.length === 0) throw new Error('list plans failed');
  const plan = res.json[0];

  console.log('Smoke: subscribe');
  res = await req('POST', '/student/subscribe', { user_id: student.user_id, plan_id: plan.plan_id }, { Authorization: `Bearer ${studentToken}` });
  if (![200, 201].includes(res.status)) throw new Error('subscribe failed');

  console.log('Smoke: get subscription');
  res = await req('GET', `/student/subscription?user_id=${student.user_id}`);
  if (res.status !== 200 || !res.json) throw new Error('subscription failed');

  console.log('Smoke: book pickup');
  res = await req('POST', '/student/book', { user_id: student.user_id, pickup_date: 'Sun 1', pickup_time_slot: '8AM-10AM', clothes_count: 10, extra_clothes: 0, notes: '' }, { Authorization: `Bearer ${studentToken}` });
  if (res.status !== 201 || !res.json.order) throw new Error('book failed');
  const orderId = res.json.order.order_id;

  console.log('Smoke: admin register + login');
  res = await req('POST', '/auth/register', { full_name: 'Admin', phone_number: adminPhone, password: 'admin', role: 'admin' });
  if (res.status !== 201) throw new Error('register admin failed');
  res = await req('POST', '/auth/login', { phone_number: adminPhone, password: 'admin' });
  if (res.status !== 200) throw new Error('login admin failed');
  const adminToken = res.json.token;

  console.log('Smoke: admin list orders awaiting_pickup');
  res = await req('GET', '/admin/orders?status=awaiting_pickup', null, { Authorization: `Bearer ${adminToken}` });
  if (res.status !== 200) throw new Error('admin orders failed');

  console.log('Smoke: admin update order status -> processing');
  res = await req('PUT', `/admin/orders/${orderId}`, { status: 'processing' }, { Authorization: `Bearer ${adminToken}` });
  if (res.status !== 200 || res.json.status !== 'processing') throw new Error('update status failed');

  console.log('All smoke tests passed.');
}

run().catch((e) => {
  console.error('Smoke tests failed:', e.message || e);
  process.exit(1);
});
