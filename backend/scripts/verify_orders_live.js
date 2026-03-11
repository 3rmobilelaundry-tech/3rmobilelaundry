const { User, Plan, Subscription, Order, Code, sequelize } = require('../src/models');
const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');

const BASE_URL = 'http://localhost:5000';
let adminToken = '';
let studentUser = null;
let riderUser = null;
let orderId = null;

async function setupData() {
  console.log('1. Setting up data...');
  
  // 1. Ensure Rider exists
  riderUser = await User.findOne({ where: { phone_number: '07000000000' } });
  if (!riderUser) {
    const hash = await bcrypt.hash('rider123', 10);
    riderUser = await User.create({
      full_name: 'Test Rider',
      phone_number: '07000000000',
      password: hash,
      role: 'rider'
    });
    console.log('Created Rider:', riderUser.user_id);
  } else {
    if (riderUser.role !== 'rider') {
      riderUser.role = 'rider';
      await riderUser.save();
    }
    console.log('Found Rider:', riderUser.user_id);
  }

  // 2. Ensure Student exists
  studentUser = await User.findOne({ where: { phone_number: '08000000000' } }); // Use demo student
  if (!studentUser) {
    const hash = await bcrypt.hash('password123', 10);
    studentUser = await User.create({
      full_name: 'Demo Student',
      phone_number: '08000000000',
      password: hash,
      student_id: 'UNILAG001',
      school: 'UNILAG',
      hostel_address: 'Jaja Hall',
      role: 'student'
    });
  }
  console.log('Using Student:', studentUser.user_id);

  // 3. Ensure Plan & Subscription
  let plan = await Plan.findOne();
  if (!plan) {
    plan = await Plan.create({
      name: 'Test Plan',
      price: 5000,
      duration_days: 30,
      max_pickups: 4,
      description: 'Test'
    });
  }
  
  await Subscription.destroy({ where: { user_id: studentUser.user_id } }); // Clear old subs
  await Subscription.create({
    user_id: studentUser.user_id,
    plan_id: plan.plan_id,
    start_date: new Date(),
    end_date: new Date(Date.now() + 30*24*60*60*1000),
    remaining_pickups: 4,
    status: 'active'
  });
  console.log('Subscription active.');

  // 4. Create Order (Pending)
  const order = await Order.create({
    user_id: studentUser.user_id,
    pickup_date: new Date(),
    pickup_time: '10:00 AM',
    clothes_count: 10,
    status: 'pending',
    notes: 'Test Order'
  });
  orderId = order.order_id;
  console.log('Created Order:', orderId);
}

async function loginAdmin() {
  console.log('2. Logging in Admin...');
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_number: '09000000000', password: 'admin123' })
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Login failed: ' + JSON.stringify(data));
  adminToken = data.token;
  console.log('Admin logged in.');
}

async function testAdminFlow() {
  const headers = { 
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  };

  // 1. List Orders
  console.log('3. Testing GET /admin/orders...');
  const res1 = await fetch(`${BASE_URL}/admin/orders`, { headers });
  const orders = await res1.json();
  const found = orders.find(o => o.order_id === orderId);
  if (!found) throw new Error('Order not found in list');
  console.log('Order found in list.');

  // 2. Accept Order
  console.log('4. Testing POST /admin/orders/:id/accept...');
  const res2 = await fetch(`${BASE_URL}/admin/orders/${orderId}/accept`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ rider_id: riderUser.user_id })
  });
  if (!res2.ok) {
     const err = await res2.json();
     throw new Error('Accept failed: ' + JSON.stringify(err));
  }
  const acceptedOrder = await res2.json();
  if (acceptedOrder.status !== 'accepted') throw new Error('Status not accepted: ' + acceptedOrder.status);
  // Check assigned_rider_id as per DB schema
  if (acceptedOrder.assigned_rider_id !== riderUser.user_id) throw new Error('Rider not assigned. Expected ' + riderUser.user_id + ' but got ' + acceptedOrder.assigned_rider_id);
  console.log('Order accepted.');
  const res2b = await fetch(`${BASE_URL}/admin/orders`, { headers });
  const ordersAfterAccept = await res2b.json();
  const acceptedSnapshot = ordersAfterAccept.find(o => o.order_id === orderId);
  if (!acceptedSnapshot) throw new Error('Accepted order missing after refresh');
  if (!/^\d{6}$/.test(String(acceptedSnapshot.pickup_code || ''))) {
    throw new Error('Pickup code missing after accept');
  }
  if (!/^\d{6}$/.test(String(acceptedSnapshot.delivery_code || ''))) {
    throw new Error('Release code missing after accept');
  }
  console.log('Pickup and release codes generated.');

  // 3. Edit Order
  console.log('5. Testing PUT /admin/orders/:id (Edit)...');
  const res3 = await fetch(`${BASE_URL}/admin/orders/${orderId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ clothes_count: 15, extra_clothes_count: 2 })
  });
  if (!res3.ok) throw new Error('Edit failed');
  const editedOrder = await res3.json();
  if (editedOrder.clothes_count !== 15) throw new Error('Edit not applied');
  console.log('Order edited.');

  // 4. Update Status to Ready
  console.log('6. Testing Status Transitions...');
  
  // picked_up
  await fetch(`${BASE_URL}/admin/orders/${orderId}/status`, {
    method: 'PUT', headers, body: JSON.stringify({ status: 'picked_up' })
  });
  
  // processing
  await fetch(`${BASE_URL}/admin/orders/${orderId}/status`, {
    method: 'PUT', headers, body: JSON.stringify({ status: 'processing' })
  });
  
  // ready
  const res4 = await fetch(`${BASE_URL}/admin/orders/${orderId}/status`, {
    method: 'PUT', headers, body: JSON.stringify({ status: 'ready' })
  });
  if (!res4.ok) throw new Error('Status update to ready failed');
  const readyOrder = await res4.json();
  if (readyOrder.status !== 'ready') throw new Error('Status not ready');
  console.log('Order is Ready.');

  // 5. Generate Code
  console.log('7. Testing Generate Code...');
  const res5 = await fetch(`${BASE_URL}/admin/orders/${orderId}/code`, {
    method: 'POST', headers
  });
  if (!res5.ok) throw new Error('Generate code failed');
  const codeData = await res5.json();
  console.log('Code generated:', codeData.code);

  // 6. Release Order
  console.log('8. Testing Release Order...');
  const res6 = await fetch(`${BASE_URL}/admin/orders/${orderId}/release`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ code_value: codeData.code })
  });
  if (!res6.ok) {
    const err = await res6.json();
    throw new Error('Release failed: ' + JSON.stringify(err));
  }
  const releasedOrder = await res6.json();
  if (releasedOrder.status !== 'delivered') throw new Error('Status not delivered');
  console.log('Order delivered successfully!');
}

async function run() {
  try {
    await setupData();
    await loginAdmin();
    await testAdminFlow();
    console.log('✅ ALL TESTS PASSED');
    process.exit(0);
  } catch (error) {
    console.error('❌ TEST FAILED:', error);
    process.exit(1);
  }
}

run();
