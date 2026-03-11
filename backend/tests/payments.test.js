const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { sequelize, User, Order, Code } = require('../src/models');

describe('Admin Payments CRUD', () => {
  jest.setTimeout(20000);
  let adminToken;
  let user;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'secret';
    await sequelize.sync({ force: true });
    user = await User.create({
      full_name: 'Test User',
      phone_number: '07000000000',
      password: 'hash',
      role: 'student'
    });
    const adminUser = await User.create({
      full_name: 'Admin User',
      phone_number: '09999999999',
      password: 'hash',
      role: 'admin'
    });
    adminToken = jwt.sign({ user_id: adminUser.user_id, role: 'admin' }, process.env.JWT_SECRET);
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('POST /admin/payments - create payment', async () => {
    const res = await request(app)
      .post('/admin/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        user_id: user.user_id,
        amount: 1234.5,
        currency: 'NGN',
        method: 'paystack',
        reference: 'REF-TEST-001'
      });
    expect(res.status).toBe(201);
    expect(res.body.payment_id).toBeDefined();
    // SQLite/Sequelize might return number or string for DECIMAL
    expect(Number(res.body.amount)).toBe(1234.5);
    expect(res.body.status).toBe('pending');
  });

  test('GET /admin/payments - list payments', async () => {
    const res = await request(app)
      .get('/admin/payments')
      .set('Authorization', `Bearer ${adminToken}`);
    if (res.status !== 200) console.error('GET /admin/payments error:', res.body);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  test('PUT /admin/payments/:id - update status', async () => {
    const list = await request(app)
      .get('/admin/payments')
      .set('Authorization', `Bearer ${adminToken}`);
    const paymentId = list.body[0].payment_id;
    const res = await request(app)
      .put(`/admin/payments/${paymentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
  });

  test('DELETE /admin/payments/:id - delete payment', async () => {
    const created = await request(app)
      .post('/admin/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        user_id: user.user_id,
        amount: 500,
        currency: 'NGN',
        method: 'paystack',
        reference: 'REF-DEL-001'
      });
    const paymentId = created.body.payment_id;
    const res = await request(app)
      .delete(`/admin/payments/${paymentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Payment deleted');
  });

  test('GET /admin/orders - list orders with user and codes', async () => {
    const orderA = await Order.create({
      user_id: user.user_id,
      pickup_date: '2026-02-10',
      pickup_time: '08:00-10:00',
      clothes_count: 3,
      status: 'pending'
    });
    const orderB = await Order.create({
      user_id: user.user_id,
      pickup_date: '2026-02-11',
      pickup_time: '10:00-12:00',
      clothes_count: 5,
      status: 'delivered'
    });

    await Code.create({
      order_id: orderA.order_id,
      code_value: '111111',
      type: 'pickup',
      status: 'active',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
    await Code.create({
      order_id: orderB.order_id,
      code_value: '222222',
      type: 'release',
      status: 'active',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    const res = await request(app)
      .get('/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const foundA = res.body.find((o) => o.order_id === orderA.order_id);
    const foundB = res.body.find((o) => o.order_id === orderB.order_id);
    expect(foundA).toBeDefined();
    expect(foundB).toBeDefined();
    expect(foundA.User).toBeDefined();
    expect(foundA.pickup_code).toBe('111111');
    expect(foundB.delivery_code).toBe('222222');
  });
});
