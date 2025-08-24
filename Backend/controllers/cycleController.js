// controllers/cycleController.js
const db = require('../config/db');

// GET /admin/cycles/active
exports.getActive = async (_req, res) => {
  const [rows] = await db.query(
    `SELECT *
       FROM allocation_cycles
      WHERE status='open'
      ORDER BY submission_open_at DESC
      LIMIT 1`
  );
  if (rows.length) return res.json(rows[0]);

  const [byDate] = await db.query(
    `SELECT *
       FROM allocation_cycles
      WHERE NOW() BETWEEN submission_open_at AND submission_close_at
      ORDER BY submission_open_at DESC
      LIMIT 1`
  );
  return res.json(byDate[0] || null);
};

// GET /admin/cycles
exports.list = async (_req, res) => {
  const [rows] = await db.query(
    `SELECT * FROM allocation_cycles ORDER BY submission_open_at DESC`
  );
  res.json(rows);
};

// POST /admin/cycles
exports.create = async (req, res) => {
  const { name, submission_open_at, submission_close_at, commit_at, weights_json } = req.body || {};
  if (!name || !submission_open_at || !submission_close_at) {
    return res.status(400).json({ message: 'name, submission_open_at, submission_close_at required' });
  }
  const [ins] = await db.query(
    `INSERT INTO allocation_cycles
       (name, submission_open_at, submission_close_at, commit_at, status, weights_json)
     VALUES (?,?,?,?, 'open', ?)`,
    [name, submission_open_at, submission_close_at, commit_at || submission_close_at, JSON.stringify(weights_json || {})]
  );
  res.status(201).json({ cycle_id: ins.insertId });
};

// PATCH /admin/cycles/:id  (update times / status)
exports.update = async (req, res) => {
  const { id } = req.params;
  const { name, submission_open_at, submission_close_at, commit_at, status, weights_json } = req.body || {};
  const [upd] = await db.query(
    `UPDATE allocation_cycles
        SET name = COALESCE(?, name),
            submission_open_at = COALESCE(?, submission_open_at),
            submission_close_at = COALESCE(?, submission_close_at),
            commit_at = COALESCE(?, commit_at),
            status = COALESCE(?, status),
            weights_json = COALESCE(?, weights_json)
      WHERE cycle_id = ?`,
    [name, submission_open_at, submission_close_at, commit_at, status, JSON.stringify(weights_json || null), id]
  );
  res.json({ updated: upd.affectedRows });
};
