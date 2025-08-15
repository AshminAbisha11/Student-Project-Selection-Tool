// models/blacklistModel.js
const db = require('../config/db');

// Insert token into your existing table: blacklisted_tokens (token, blacklisted_at)
exports.addTokenToBlacklist = async (token) => {
  if (!token || token === 'null' || token === 'undefined') return;
  // If your table doesn't have blacklisted_at, remove it from the query.
  await db.query(
    'INSERT IGNORE INTO blacklisted_tokens (token, blacklisted_at) VALUES (?, NOW())',
    [token]
  );
};

exports.isTokenBlacklisted = async (token) => {
  const [rows] = await db.query(
    'SELECT 1 FROM blacklisted_tokens WHERE token = ? LIMIT 1',
    [token]
  );
  return rows.length > 0;
};
