const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../server');
const { sequelize, User } = require('../src/models');

describe('Auth API', () => {
  beforeAll(async () => {
    await sequelize.sync();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('rejects missing credentials', async () => {
    const res = await request(app).post('/auth/login').send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('missing_credentials');
  });

  test('normalizes phone number on register and login', async () => {
    const phoneInput = '080-123-45678';
    const phoneStored = '08012345678';
    const email = `test_${Date.now()}@example.com`;
    const password = 'Password123';

    const register = await request(app)
      .post('/auth/register')
      .send({
        full_name: 'Test User',
        email,
        phone_number: phoneInput,
        password,
        role: 'admin'
      });

    expect(register.statusCode).toBe(201);

    const login = await request(app)
      .post('/auth/login')
      .send({ phone_number: phoneStored, password });

    expect(login.statusCode).toBe(200);
    expect(login.body.token).toBeTruthy();
  });

  test('rejects invalid credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ phone_number: '08000000000', password: 'wrong' });
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('invalid_credentials');
  });

  test('blocks suspended users', async () => {
    const phone = `080${Date.now().toString().slice(-8)}`;
    const hashed = await bcrypt.hash('Password123', 10);
    const user = await User.create({
      full_name: 'Suspended User',
      email: `susp_${Date.now()}@example.com`,
      phone_number: phone,
      password: hashed,
      role: 'student',
      status: 'suspended'
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ phone_number: user.phone_number, password: 'Password123' });

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('account_inactive');
  });
});
