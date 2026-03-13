require('dotenv').config();
const { Sequelize } = require("sequelize");
const path = require('path');

console.log("DATABASE_URL from environment:", process.env.DATABASE_URL ? "FOUND" : "MISSING");

let sequelize;

const dbUrl = process.env.DATABASE_URL;

console.log("DATABASE_URL detected:", dbUrl ? "YES" : "NO");

if (dbUrl) {
  console.log("Initializing Database...");
  console.log("Database type: PostgreSQL");

  sequelize = new Sequelize(dbUrl, {
    dialect: "postgres",
    protocol: "postgres",
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  });

} else {
  console.log("⚠️ PostgreSQL not detected (DATABASE_URL missing). Using SQLite only for development.");

  sequelize = new Sequelize({
    dialect: "sqlite",
    storage: path.join(__dirname, '../../database.sqlite'),
    logging: false
  });
}

module.exports = sequelize;