const db = require('../config/db');

async function columnExists(table, column) {
  const [rows] = await db.query(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function buildUserColumnMap() {
  // columns we always try to return
  const base = ['user_id', 'name', 'email', 'role'];
  // optional profile columns
  const optionals = ['department', 'phone', 'office', 'bio'];

  const exists = {};
  for (const col of [...base, ...optionals]) {
    exists[col] = await columnExists('users', col);
  }
  return exists;
}

exports.getMe = async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const cols = await buildUserColumnMap();

    const selected = [];
    for (const c of ['user_id', 'name', 'email', 'role', 'department', 'phone', 'office', 'bio']) {
      if (cols[c]) selected.push(c);
    }
    // If an optional column doesn't exist, alias NULL so frontend always gets the keys.
    for (const c of ['department', 'phone', 'office', 'bio']) {
      if (!cols[c]) selected.push(`NULL AS ${c}`);
    }

    const [[u]] = await db.query(
      `SELECT ${selected.join(', ')} FROM users WHERE user_id = ? LIMIT 1`,
      [userId]
    );
    if (!u) return res.status(404).json({ message: 'User not found' });

    res.json(u);
  } catch (e) {
    console.error('getMe error:', e);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateMe = async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { name, department, phone, office, bio } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }

    const cols = await buildUserColumnMap();

    const sets = [];
    const params = [];

    // Always allow name
    if (cols.name) {
      sets.push('name = ?');
      params.push(name.trim());
    }

    // Optional fields: only update if the column exists
    if (cols.department) { sets.push('department = ?'); params.push(department || null); }
    if (cols.phone)      { sets.push('phone = ?');      params.push(phone || null); }
    if (cols.office)     { sets.push('office = ?');     params.push(office || null); }
    if (cols.bio)        { sets.push('bio = ?');        params.push(bio || null); }

    // updated_at if present
    if (await columnExists('users', 'updated_at')) {
      sets.push('updated_at = CURRENT_TIMESTAMP');
    }

    if (!sets.length) {
      // nothing to update; return current profile
      return exports.getMe(req, res);
    }

    params.push(userId);
    await db.query(`UPDATE users SET ${sets.join(', ')} WHERE user_id = ?`, params);

    // return fresh record
    return exports.getMe(req, res);
  } catch (e) {
    console.error('updateMe error:', e);
    res.status(500).json({ message: 'Failed to update profile' });
  }
};
