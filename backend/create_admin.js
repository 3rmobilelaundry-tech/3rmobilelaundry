const { sequelize } = require('./src/models');
const bcrypt = require('bcryptjs');
const { User } = require('./src/models');

async function createAdmin() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    await sequelize.sync();
    console.log('Database synced.');

    const phone = '08069090488';
    const password = 'admin123'; // or generate a random one
    const hashedPassword = await bcrypt.hash(password, 10);

    const existing = await User.findOne({ where: { phone_number: phone } });
    if (existing) {
      console.log('Admin already exists.');
      return;
    }

    await User.create({
      full_name: 'Admin User',
      email: 'admin@3rlaundry.com',
      phone_number: phone,
      password: hashedPassword,
      role: 'admin',
      email_verified: true,
      email_verified_at: new Date()
    });

    console.log('Admin created with phone:', phone, 'password:', password);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

createAdmin();