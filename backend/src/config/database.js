const { Sequelize } = require('sequelize');
const path = require('path');

const toBool = (value) => String(value || '').toLowerCase() === 'true';

// Railway provides DATABASE_URL which is the primary way to connect.
// We also check for PGHOST/PGUSER as fallbacks.
const databaseUrl = process.env.DATABASE_URL;
const usePostgres = Boolean(databaseUrl || process.env.PGHOST || process.env.PGUSER);

// For Railway internal networking, SSL might not be needed, but for public access it is.
// We'll enable SSL by default if DATABASE_URL is present, as most cloud providers require it.
// However, we allow disabling it via explicit env var if needed.
const sslEnabled = toBool(process.env.PGSSL || process.env.DATABASE_SSL) || !!databaseUrl;

console.log(`Initializing Database...`);
console.log(`- Type: ${usePostgres ? 'PostgreSQL' : 'SQLite'}`);
if (usePostgres) {
    console.log(`- SSL: ${sslEnabled ? 'Enabled' : 'Disabled'}`);
}

const sequelize = usePostgres
  ? new Sequelize(databaseUrl || undefined, {
      dialect: 'postgres',
      host: process.env.PGHOST,
      port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
      username: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      logging: false, // Keep logs clean, enable if debugging needed
      dialectOptions: sslEnabled ? { 
          ssl: { 
              require: true, 
              rejectUnauthorized: false 
          } 
      } : undefined
    })
  : new Sequelize({
      dialect: 'sqlite',
      storage: path.join(__dirname, '../../database.sqlite'),
      logging: false
    });

module.exports = sequelize;
