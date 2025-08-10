const db = require('../config/db');

/**
 * GET /preferences
 * Return the student's preferences WITH project_id so the UI can
 * map project_id -> preference_id (needed for delete).
 */
exports.getPreferencesByStudent = async (req, res) => {
  const studentId = req.user?.user_id;
  if (!studentId) return res.status(401).json({ message: 'Unauthorized' });

  const sql = `
    SELECT
      p.preference_id,
      p.preference_order,
      p.project_id,                    -- important for UI remove
      pr.title,
      pr.description,
      pr.supervisor_name
    FROM preferences p
    JOIN projects pr ON p.project_id = pr.project_id
    WHERE p.student_id = ?
    ORDER BY p.preference_order
  `;

  try {
    const [rows] = await db.query(sql, [studentId]);
    // Return an array always (easier for the client)
    return res.status(200).json(rows || []);
  } catch (err) {
    console.error('Error fetching preferences:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};


/**
 * POST /preferences
 * Body: { project_id }
 * Adds a preference (max 5). Returns new preference_id and project_id.
 */
exports.addPreference = async (req, res) => {
  const student_id = req.user?.user_id;
  const { project_id } = req.body;

  if (!student_id) return res.status(401).json({ message: 'Unauthorized' });
  if (!project_id) return res.status(400).json({ message: 'project_id is required' });

  try {
    // existing preferences
    const [existing] = await db.query(
      `SELECT project_id FROM preferences WHERE student_id = ? ORDER BY preference_order ASC`,
      [student_id]
    );

    if (existing.length >= 5) {
      return res.status(400).json({ message: 'You can only add up to 5 preferences.' });
    }

    if (existing.some(p => p.project_id === project_id)) {
      return res.status(400).json({ message: 'This project is already in your preferences.' });
    }

    const preference_order = existing.length + 1;

    const [result] = await db.query(
      `INSERT INTO preferences (student_id, project_id, preference_order) VALUES (?, ?, ?)`,
      [student_id, project_id, preference_order]
    );

    return res.status(201).json({
      message: 'Preference added successfully',
      preference_id: result.insertId,
      project_id,                    // include for UI mapping
      preference_order,
    });
  } catch (err) {
    console.error('Error adding preference:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};


/**
 * PATCH /preferences/order
 * Body: { preference_id, preference_order }
 */
exports.updatePreferenceOrder = async (req, res) => {
  const { preference_id, preference_order } = req.body;
  if (!preference_id || !Number.isInteger(preference_order)) {
    return res.status(400).json({ message: 'preference_id and preference_order are required' });
  }

  const sql = `
    UPDATE preferences
    SET preference_order = ?
    WHERE preference_id = ?
  `;

  try {
    await db.query(sql, [preference_order, preference_id]);
    return res.json({ message: 'Preference order updated successfully' });
  } catch (err) {
    console.error('Error updating preference order:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};


/**
 * DELETE /preferences/:preferenceId
 * Deletes a preference and compacts the remaining order.
 */
exports.deletePreference = async (req, res) => {
  const preferenceId = req.params.preferenceId;
  const studentId = req.user?.user_id;

  if (!studentId) return res.status(401).json({ message: 'Unauthorized' });
  if (!preferenceId) return res.status(400).json({ message: 'preferenceId is required' });

  try {
    // Delete the chosen preference
    const [del] = await db.query(
      `DELETE FROM preferences WHERE preference_id = ? AND student_id = ?`,
      [preferenceId, studentId]
    );

    if (del.affectedRows === 0) {
      return res.status(404).json({ message: 'Preference not found' });
    }

    // Re-pack orders 1..n
    const [remaining] = await db.query(
      `SELECT preference_id FROM preferences WHERE student_id = ? ORDER BY preference_order ASC`,
      [studentId]
    );

    for (let i = 0; i < remaining.length; i++) {
      const id = remaining[i].preference_id;
      // Only update if different to avoid unnecessary writes
      await db.query(
        `UPDATE preferences SET preference_order = ? WHERE preference_id = ?`,
        [i + 1, id]
      );
    }

    return res.status(200).json({ message: 'Preference deleted and reordered successfully' });
  } catch (err) {
    console.error('Error deleting/reordering preference:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};
