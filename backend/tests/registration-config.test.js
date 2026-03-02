const request = require('supertest');
const app = require('../server');
const { sequelize, RegistrationField, School } = require('../src/models');

describe('Registration Config', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true });
    await RegistrationField.bulkCreate([
      { label: 'Full Name', type: 'full_name', required: true, active: true, order: 1 },
      { label: 'Legacy Field', type: 'legacy', required: false, active: false, order: 2 }
    ]);
    await School.bulkCreate([
      { school_name: 'UNILAG', active: true },
      { school_name: 'Archived', active: false }
    ]);
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('returns only active schools and fields', async () => {
    const res = await request(app).get('/student/registration-config');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.fields)).toBe(true);
    expect(Array.isArray(res.body.schools)).toBe(true);
    expect(res.body.fields.some((f) => f.active === false)).toBe(false);
    expect(res.body.schools.some((s) => s.active === false)).toBe(false);
    const schoolNames = res.body.schools.map((s) => s.school_name);
    expect(schoolNames).toContain('UNILAG');
    expect(schoolNames).not.toContain('Archived');
  });
});
