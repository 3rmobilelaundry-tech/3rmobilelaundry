const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config(); // Load environment variables from .env

const toBool = (value) => String(value || '').toLowerCase() === 'true';

// Railway provides DATABASE_URL which is the primary way to connect.
// We also check for PGHOST/PGUSER as fallbacks.
const databaseUrl = process.env.DATABASE_URL;

// Ensure PostgreSQL is ALWAYS used in production or when DATABASE_URL is present.
// Only fallback to SQLite if explicitly no PG config is found AND we are in development.
const usePostgres = Boolean(databaseUrl || process.env.PGHOST || process.env.PGUSER);

if (!usePostgres) {
    console.warn('⚠️  No PostgreSQL configuration found. Defaulting to SQLite (NOT RECOMMENDED FOR PRODUCTION).');
}

// For Railway internal networking, SSL might not be needed, but for public access it is.
// We'll enable SSL by default if DATABASE_URL is present, as most cloud providers require it.
// However, we allow disabling it via explicit env var if needed.
const sslEnabled = toBool(process.env.PGSSL || process.env.DATABASE_SSL) || (!!databaseUrl && process.env.NODE_ENV === 'production');

console.log(`Initializing Database...`);
console.log(`- Type: ${usePostgres ? 'PostgreSQL' : 'SQLite'}`);
if (usePostgres) {
    console.log(`- SSL: ${sslEnabled ? 'Enabled' : 'Disabled'}`);
}

const sequelize = usePostgres
  ? new Sequelize(databaseUrl, {
      dialect: 'postgres',
      protocol: 'postgres',
      logging: false, // Keep logs clean, enable if debugging needed
      dialectOptions: sslEnabled ? { 
          ssl: { 
              require: true, 
              rejectUnauthorized: false 
          } 
      } : {}
    })
  : new Sequelize({
      dialect: 'sqlite',
      storage: path.join(__dirname, '../../database.sqlite'),
      logging: false
    });

module.exports = sequelize;