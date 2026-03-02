const { Sequelize } = require('sequelize');
const path = require('path');

const toBool = (value) => String(value || '').toLowerCase() === 'true';
const usePostgres = Boolean(process.env.DATABASE_URL || process.env.PGHOST || process.env.PGUSER);
const sslEnabled = toBool(process.env.PGSSL || process.env.DATABASE_SSL);

const sequelize = usePostgres
  ? new Sequelize(process.env.DATABASE_URL || undefined, {
      dialect: 'postgres',
      host: process.env.PGHOST,
      port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
      username: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      logging: false,
      dialectOptions: sslEnabled ? { ssl: { require: true, rejectUnauthorized: false } } : undefined
    })
  : new Sequelize({
      dialect: 'sqlite',
      storage: path.join(__dirname, '../../database.sqlite'),
      logging: false
    });

module.exports = sequelize;
