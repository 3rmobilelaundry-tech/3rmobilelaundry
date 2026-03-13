require('dotenv').config();
const { Sequelize } = require("sequelize");
const path = require('path');

console.log("Initializing Database...");

let sequelize;

// Force PostgreSQL if DATABASE_URL is present
if (process.env.DATABASE_URL) {
  console.log("Database type: PostgreSQL");
  console.log("Using connection string starting with:", process.env.DATABASE_URL.substring(0, 15) + "...");

  sequelize = new Sequelize(process.env.DATABASE_URL, {
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
  console.log("⚠️ PostgreSQL not detected (DATABASE_URL is missing).");
  console.log("Falling back to SQLite (development only)");

  sequelize = new Sequelize({
    dialect: "sqlite",
    storage: path.join(__dirname, '../../database.sqlite'),
    logging: false
  });
}

module.exports = sequelize;