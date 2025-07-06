const mysql = require("mysql2/promise")
require('dotenv').config();

const db = mysql.createPool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT
});

(async () => {
  try {
    const connection = await db.getConnection();
    console.log("Connected to the database.");
    connection.release();
  } catch (err) {
    console.error("Database connection failed:", err.message);
  }
})();

module.exports = db;


