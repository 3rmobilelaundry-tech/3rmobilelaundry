const path = require('path');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../server');
const { sequelize, User, Payment, Plan, Subscription } = require('../src/models');

describe('Admin API', () => {
  let token;
  beforeAll(async () => {
    await sequelize.sync();
    const phone_number = '09000000000';
    const password = 'admin123';
    const existing = await User.findOne({ where: { phone_number } });
    if (!existing) {
      const hashed = await bcrypt.hash(password, 10);
      await User.create({
        full_name: 'Test Admin',
        email: `admin_${Date.now()}@example.com`,
        phone_number,
        password: hashed,
        role: 'admin',
        status: 'active',
        email_verified: true,
        email_verified_at: new Date()
      });
    }
    const res = await request(app)
      .post('/auth/login')
      .send({ phone_number, password });
    token = res.body.token;
  });

  test('list users', async () => {
    const res = await request(app).get('/admin/users').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  test('soft delete user', async () => {
    const phoneSuffix = String(Date.now()).slice(-5);
    const phone = `080000${phoneSuffix}`;
    const create = await request(app)
      .post('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        full_name: 'Delete Target',
        phone_number: phone,
        password: 'Password123',
        role: 'student'
      });
    expect(create.statusCode).toBe(200);
    const createdId = create.body.user_id;
    expect(createdId).toBeTruthy();

    const del = await request(app)
      .delete(`/admin/users/${createdId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.statusCode).toBe(200);

    const list = await request(app)
      .get('/admin/users')
      .set('Authorization', `Bearer ${token}`);
    const ids = (list.body.items || []).map((u) => u.user_id);
    expect(ids.includes(createdId)).toBe(false);
  });

  test('create carousel item and verify active rotation list', async () => {
    const imagePath = path.resolve(__dirname, '..', '..', 'apps', 'student-web', 'assets', 'icon.png');
    const title = `Carousel Test ${Date.now()}`;
    const create = await request(app)
      .post('/carousel')
      .set('Authorization', `Bearer ${token}`)
      .field('title', title)
      .field('description', 'Automated carousel test item')
      .field('link', 'https://example.com')
      .field('status', 'active')
      .field('order_index', '0')
      .attach('image', imagePath);
    expect(create.statusCode).toBe(201);
    const createdId = create.body.id || create.body.carousel_id;
    expect(createdId).toBeTruthy();

    const active = await request(app).get('/carousel/active');
    expect(active.statusCode).toBe(200);
    const activeIds = Array.isArray(active.body) ? active.body.map((item) => item.id || item.carousel_id) : [];
    expect(activeIds.includes(createdId)).toBe(true);

    const del = await request(app)
      .delete(`/carousel/${createdId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.statusCode).toBe(200);
  });

  test('create and delete notification', async () => {
    const create = await request(app)
      .post('/admin/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Test notification' });
    expect(create.statusCode).toBe(200);
    const id = create.body.notification_id || create.body.id;
    expect(id).toBeTruthy();

    const list = await request(app)
      .get('/admin/notifications')
      .set('Authorization', `Bearer ${token}`);
    expect(list.statusCode).toBe(200);
    const ids = Array.isArray(list.body) ? list.body.map((item) => item.notification_id || item.id) : [];
    expect(ids.includes(id)).toBe(true);
  });

  test('recent front logs', async () => {
    const res = await request(app).get('/admin/front-logs/recent?lines=10').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.logs)).toBe(true);
  });

  test('audit logs', async () => {
    const res = await request(app).get('/admin/audit-logs?limit=5').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('create and update subscription', async () => {
    const plan = await Plan.create({
      name: `Test Plan ${Date.now()}`,
      price: 5000,
      duration_days: 30,
      max_pickups: 4,
      clothes_limit: 15,
      type: 'monthly',
      status: 'active'
    });

    const customerPhone = `0907${String(Date.now()).slice(-7)}`;
    const user = await User.create({
      full_name: 'Subscription Customer',
      email: `sub_customer_${Date.now()}@example.com`,
      phone_number: customerPhone,
      password: await bcrypt.hash('CustPass123', 10),
      role: 'student',
      status: 'active',
      email_verified: true,
      email_verified_at: new Date()
    });

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + 30);

    const create = await request(app)
      .post('/admin/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        user_id: user.user_id,
        plan_id: plan.plan_id,
        status: 'active',
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        remaining_pickups: 4
      });
    expect(create.statusCode).toBe(201);
    const subId = create.body.subscription_id;
    expect(subId).toBeTruthy();

    const update = await request(app)
      .put(`/admin/subscriptions/${subId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'paused' });
    expect(update.statusCode).toBe(200);
    expect(update.body.status).toBe('paused');

    await Subscription.destroy({ where: { subscription_id: subId } });
    await Plan.destroy({ where: { plan_id: plan.plan_id } });
    await User.destroy({ where: { user_id: user.user_id } });
  });

  test('only admin can update payment status', async () => {
    const receptionistPhone = `0902${String(Date.now()).slice(-7)}`;
    const riderPhone = `0903${String(Date.now()).slice(-7)}`;
    const password = 'Password123';

    const existingReceptionist = await User.findOne({ where: { phone_number: receptionistPhone } });
    if (!existingReceptionist) {
      const hashed = await bcrypt.hash(password, 10);
      await User.create({
        full_name: 'Test Receptionist',
        email: `receptionist_${Date.now()}@example.com`,
        phone_number: receptionistPhone,
        password: hashed,
        role: 'receptionist',
        status: 'active',
        email_verified: true,
        email_verified_at: new Date()
      });
    }

    const existingRider = await User.findOne({ where: { phone_number: riderPhone } });
    if (!existingRider) {
      const hashed = await bcrypt.hash(password, 10);
      await User.create({
        full_name: 'Test Rider',
        email: `rider_${Date.now()}@example.com`,
        phone_number: riderPhone,
        password: hashed,
        role: 'rider',
        status: 'active',
        email_verified: true,
        email_verified_at: new Date()
      });
    }

    const receptionistLogin = await request(app)
      .post('/auth/login')
      .send({ phone_number: receptionistPhone, password });
    const receptionistToken = receptionistLogin.body.token;

    const riderLogin = await request(app)
      .post('/auth/login')
      .send({ phone_number: riderPhone, password });
    const riderToken = riderLogin.body.token;

    const customerPhone = `0904${String(Date.now()).slice(-7)}`;
    const customer = await User.create({
      full_name: 'Payment Customer',
      email: `customer_${Date.now()}@example.com`,
      phone_number: customerPhone,
      password: await bcrypt.hash('CustPass123', 10),
      role: 'student',
      status: 'active',
      email_verified: true,
      email_verified_at: new Date()
    });

    const payment = await Payment.create({
      user_id: customer.user_id,
      amount: 1000,
      currency: 'NGN',
      payment_type: 'subscription',
      gateway: 'cash',
      status: 'pending',
      reference: `ref_${Date.now()}`
    });

    const adminUpdate = await request(app)
      .patch(`/admin/payments/${payment.payment_id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'paid' });
    expect(adminUpdate.statusCode).toBe(200);
    expect(adminUpdate.body.status).toBe('paid');

    const receptionistDenied = await request(app)
      .patch(`/admin/payments/${payment.payment_id}/status`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ status: 'failed' });
    expect(receptionistDenied.statusCode).toBe(403);

    const riderDenied = await request(app)
      .patch(`/admin/payments/${payment.payment_id}/status`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ status: 'failed' });
    expect(riderDenied.statusCode).toBe(403);
  });
});
