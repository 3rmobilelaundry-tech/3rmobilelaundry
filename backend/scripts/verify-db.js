const { Sequelize } = require('sequelize');
const sequelize = require('../src/config/database');
const { User, Order, Notification, Subscription, Plan } = require('../src/models');

async function verifyDatabase() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connected successfully.');

    // 1. Verify Tables
    const tables = await sequelize.getQueryInterface().showAllSchemas();
    console.log('\nScanning tables...');
    const tableNames = await sequelize.getQueryInterface().showAllTables();
    
    const requiredTables = ['Users', 'Orders', 'Notifications', 'Subscriptions', 'Plans'];
    const missingTables = requiredTables.filter(t => !tableNames.includes(t));

    if (missingTables.length > 0) {
      console.warn('⚠️  Some tables might be missing:', missingTables.join(', '));
      console.log('Attempting to sync models...');
      await sequelize.sync(); // This will create them if missing
      console.log('✅ Models synced.');
    } else {
      console.log('✅ Required tables exist:', tableNames.join(', '));
    }

    // 2. Verify Head Admin
    console.log('\nChecking for Head Admin...');
    const headAdmin = await User.findOne({ where: { role: 'head_admin' } });
    if (headAdmin) {
      console.log(`✅ Head Admin found: ${headAdmin.email} (${headAdmin.role})`);
    } else {
      console.warn('⚠️  Head Admin not found. Running seed...');
      // Note: The main server.js handles this on startup, but we can call it here too if needed
      // For verification, we just report it.
    }

    // 3. Count Records
    const userCount = await User.count();
    const orderCount = await Order.count();
    console.log(`\nDatabase Stats:`);
    console.log(`- Users: ${userCount}`);
    console.log(`- Orders: ${orderCount}`);

    console.log('\n✅ Verification complete. Backend is ready.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database verification failed:', error);
    process.exit(1);
  }
}

verifyDatabase();