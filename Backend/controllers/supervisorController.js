const db = require('../config/db');

exports.listSupervisors = async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT user_id AS supervisor_id, name, email
         FROM users
        WHERE role = 'supervisor'
        ORDER BY name ASC`
    );
    res.json(rows || []);
  } catch (e) {
    console.error('listSupervisors error:', e);
    res.status(500).json({ message: 'Database error' });
  }
};
