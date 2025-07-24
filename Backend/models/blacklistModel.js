const db = require('../config/db');


exports.addTokenToBlacklist = async (token) => {
  const [result] = await db.query(
    'INSERT INTO blacklisted_tokens (token) VALUES (?)',
    [token]
  );
  return result;
};

exports.isTokenBlacklisted = async (token) => {
  const [rows] = await db.query(
    'SELECT id FROM blacklisted_tokens WHERE token = ? LIMIT 1',
    [token]
  );
  return rows.length > 0;
};
