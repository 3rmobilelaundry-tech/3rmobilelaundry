const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { sequelize, User, Plan } = require('../src/models');

describe('Plan Feature & Emergency Removal', () => {
  let adminToken;
  let studentToken;
  let user;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'secret';
    await sequelize.sync({ force: true });
    user = await User.create({
      full_name: 'Test Student',
      email: 'student@example.com',
      phone_number: '07000000000',
      password: 'hash',
      role: 'student',
      email_verified: true,
      email_verified_at: new Date()
    });
    studentToken = jwt.sign({ user_id: user.user_id, role: 'student' }, process.env.JWT_SECRET);
    
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

  test('Emergency route should be gone', async () => {
    const res = await request(app)
      .post('/student/emergency/book')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({});
    expect(res.status).toBe(404);
  });

  test('Admin can create a plan', async () => {
    const res = await request(app)
      .post('/admin/plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Test Plan',
        price: 5000,
        duration_days: 30,
        max_pickups: 4,
        description: 'Test Description'
      });
    if (res.status !== 201) console.error('Create Plan Error:', res.body);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Plan');
  });

  test('Student can list plans', async () => {
    const res = await request(app)
      .get('/student/plans')
      .set('Authorization', `Bearer ${studentToken}`);
    if (res.status !== 200) console.error('List Plans Error:', res.body);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].name).toBe('Test Plan');
    expect(Array.isArray(res.body[0].payment_methods)).toBe(true);
  });

  test('Student can subscribe', async () => {
    const plans = await request(app)
      .get('/student/plans')
      .set('Authorization', `Bearer ${studentToken}`);
    const planId = plans.body[0].plan_id;

    const res = await request(app)
      .post('/student/subscribe')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ user_id: user.user_id, plan_id: planId, payment_method: 'cash' });
    
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
  });

  test('Student can get subscription', async () => {
    const res = await request(app)
      .get(`/student/subscription?user_id=${user.user_id}`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    if (res.body) {
      expect(['active', 'pending']).toContain(res.body.status);
      expect(Array.isArray(res.body.Plan?.payment_methods)).toBe(true);
    } else {
      expect(res.body).toBeNull();
    }
  });
});
