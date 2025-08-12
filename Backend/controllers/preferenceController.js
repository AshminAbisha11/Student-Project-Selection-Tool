// controllers/preferenceController.js
const db = require('../config/db');

/**
 * GET /preferences
 * Return the student's preferences WITH project_id so the UI can
 * map project_id -> preference_id (needed for delete).
 * Includes contacted_supervisor.
 */
exports.getPreferencesByStudent = async (req, res) => {
  const studentId = req.user?.user_id;
  if (!studentId) return res.status(401).json({ message: 'Unauthorized' });

  const sql = `
    SELECT
      p.preference_id,
      p.preference_order,
      p.project_id,                    -- important for UI remove
      p.contacted_supervisor,          -- 'Yes' | 'No'
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
    return res.status(200).json(rows || []);
  } catch (err) {
    console.error('Error fetching preferences:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};


/**
 * POST /preferences
 * Body: { project_id, contacted_supervisor }
 * Adds a preference (max 5). Saves active cycle_id from req.cycle (set by submissionWindow).
 */
exports.addPreference = async (req, res) => {
  const student_id = req.user?.user_id;
  const { project_id, contacted_supervisor } = req.body;
  const cycleId = req.cycle?.cycle_id; // attached by submissionWindow

  if (!student_id) return res.status(401).json({ message: 'Unauthorized' });
  if (!cycleId)   return res.status(403).json({ message: 'No active allocation cycle.' });
  if (!project_id) return res.status(400).json({ message: 'project_id is required' });

  const validValues = ['Yes', 'No'];
  if (!contacted_supervisor || !validValues.includes(contacted_supervisor)) {
    return res.status(400).json({ message: "contacted_supervisor is required and must be 'Yes' or 'No'" });
  }

  try {
    // existing preferences for this student (limit 5 total)
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
      `INSERT INTO preferences
         (student_id, project_id, preference_order, contacted_supervisor, cycle_id)
       VALUES (?, ?, ?, ?, ?)`,
      [student_id, project_id, preference_order, contacted_supervisor, cycleId]
    );

    return res.status(201).json({
      message: 'Preference added successfully',
      preference_id: result.insertId,
      project_id,
      preference_order,
      contacted_supervisor,
      cycle_id: cycleId,
    });
  } catch (err) {
    console.error('Error adding preference:', err);
    // surface unique violation clearly (if any)
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Duplicate preference for this project.' });
    }
    return res.status(500).json({ error: 'Database error' });
  }
};


/**
 * PUT /preferences
 * Body: { preference_id, preference_order }
 * Updates order; enforces ownership.
 */
exports.updatePreferenceOrder = async (req, res) => {
  const studentId = req.user?.user_id;
  const { preference_id, preference_order } = req.body;

  if (!studentId) return res.status(401).json({ message: 'Unauthorized' });
  if (!preference_id || !Number.isInteger(preference_order)) {
    return res.status(400).json({ message: 'preference_id and preference_order are required' });
  }

  const sql = `
    UPDATE preferences
    SET preference_order = ?
    WHERE preference_id = ? AND student_id = ?
  `;

  try {
    const [r] = await db.query(sql, [preference_order, preference_id, studentId]);
    if (r.affectedRows === 0) {
      return res.status(404).json({ message: 'Preference not found' });
    }
    return res.json({ message: 'Preference order updated successfully' });
  } catch (err) {
    console.error('Error updating preference order:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};


/**
 * PATCH /preferences/contacted
 * Body: { preference_id, contacted_supervisor }
 * Toggle the 'Have you contacted the supervisor?' flag; enforces ownership.
 */
exports.updateContactedSupervisor = async (req, res) => {
  const studentId = req.user?.user_id;
  if (!studentId) return res.status(401).json({ message: 'Unauthorized' });

  let { preference_id, contacted_supervisor } = req.body;

  // normalize
  const v = String(contacted_supervisor || '').trim().toLowerCase();
  if (v !== 'yes' && v !== 'no') {
    return res.status(400).json({ message: "contacted_supervisor must be 'Yes' or 'No'" });
  }
  contacted_supervisor = v === 'yes' ? 'Yes' : 'No';

  if (!preference_id || isNaN(Number(preference_id))) {
    return res.status(400).json({ message: 'valid preference_id is required' });
  }

  try {
    const [result] = await db.query(
      `UPDATE preferences
         SET contacted_supervisor = ?
       WHERE preference_id = ? AND student_id = ?`,
      [contacted_supervisor, preference_id, studentId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Preference not found' });
    }

    return res.json({ message: 'Contacted supervisor flag updated successfully' });
  } catch (err) {
    console.error('Error updating contacted_supervisor:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};


/**
 * DELETE /preferences/:preferenceId
 * Deletes a preference and compacts the remaining order; enforces ownership.
 */
exports.deletePreference = async (req, res) => {
  const preferenceId = req.params.preferenceId;
  const studentId = req.user?.user_id;

  if (!studentId) return res.status(401).json({ message: 'Unauthorized' });
  if (!preferenceId) return res.status(400).json({ message: 'preferenceId is required' });

  try {
    // Delete the chosen preference (only for this student)
    const [del] = await db.query(
      `DELETE FROM preferences WHERE preference_id = ? AND student_id = ?`,
      [preferenceId, studentId]
    );

    if (del.affectedRows === 0) {
      return res.status(404).json({ message: 'Preference not found' });
    }

    // Re-pack orders 1..n for this student
    const [remaining] = await db.query(
      `SELECT preference_id FROM preferences WHERE student_id = ? ORDER BY preference_order ASC`,
      [studentId]
    );

    for (let i = 0; i < remaining.length; i++) {
      const id = remaining[i].preference_id;
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
