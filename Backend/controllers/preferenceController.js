// controllers/preferenceController.js
const db = require('../config/db');

const VALID_CONTACT = ['Yes', 'No'];

/* -------------------------------------------------------
 * Helpers
 * ----------------------------------------------------- */
async function repackOrders(studentId) {
  const [rows] = await db.query(
    `SELECT preference_id FROM preferences
     WHERE student_id = ?
     ORDER BY preference_order ASC`,
    [studentId]
  );
  for (let i = 0; i < rows.length; i++) {
    const id = rows[i].preference_id;
    await db.query(`UPDATE preferences SET preference_order = ? WHERE preference_id = ?`, [i + 1, id]);
  }
}

/* =======================================================
 * GET /preferences
 * Return the student's preferences (with project_id)
 * ===================================================== */
exports.getPreferencesByStudent = async (req, res) => {
  const studentId = req.user?.user_id;
  if (!studentId) return res.status(401).json({ message: 'Unauthorized' });

  const sql = `
    SELECT
      p.preference_id,
      p.preference_order,
      p.project_id,
      p.contacted_supervisor,      -- 'Yes' | 'No'
      p.cycle_id,
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

/* =======================================================
 * POST /preferences
 * Body: { project_id }
 * Adds a preference (max 5). Defaults contacted_supervisor = 'No'.
 * Saves active cycle_id from req.cycle (set by submissionWindow).
 * ===================================================== */
exports.addPreference = async (req, res) => {
  const student_id = req.user?.user_id;
  const { project_id } = req.body;
  const cycleId = req.cycle?.cycle_id; // attached by submissionWindow

  if (!student_id) return res.status(401).json({ message: 'Unauthorized' });
  if (!cycleId)   return res.status(403).json({ message: 'No active allocation cycle.' });
  if (!project_id) return res.status(400).json({ message: 'project_id is required' });

  try {
    // existing preferences (limit 5)
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
    const contacted_supervisor = 'No'; // <— default on add from Browse

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
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Duplicate preference for this project.' });
    }
    return res.status(500).json({ error: 'Database error' });
  }
};

/* =======================================================
 * PUT /preferences
 * Body: { preference_id, preference_order }
 * Updates order; enforces ownership.
 * ===================================================== */
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

/* =======================================================
 * PATCH /preferences/contacted
 * Body: { preference_id, contacted_supervisor }
 * Toggle 'Have you contacted the supervisor?' flag.
 * ===================================================== */
exports.updateContactedSupervisor = async (req, res) => {
  const studentId = req.user?.user_id;
  if (!studentId) return res.status(401).json({ message: 'Unauthorized' });

  let { preference_id, contacted_supervisor } = req.body;

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

/* =======================================================
 * DELETE /preferences/:preferenceId
 * Deletes a preference and compacts the remaining order.
 * ===================================================== */
exports.deletePreference = async (req, res) => {
  const preferenceId = req.params.preferenceId;
  const studentId = req.user?.user_id;

  if (!studentId) return res.status(401).json({ message: 'Unauthorized' });
  if (!preferenceId) return res.status(400).json({ message: 'preferenceId is required' });

  try {
    const [del] = await db.query(
      `DELETE FROM preferences WHERE preference_id = ? AND student_id = ?`,
      [preferenceId, studentId]
    );

    if (del.affectedRows === 0) {
      return res.status(404).json({ message: 'Preference not found' });
    }

    await repackOrders(studentId);
    return res.status(200).json({ message: 'Preference deleted and reordered successfully' });
  } catch (err) {
    console.error('Error deleting/reordering preference:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};

/* =======================================================
 * POST /preferences/submit
 * Final submission from My Preferences page.
 * - Validates contacted_supervisor values
 * - Snapshots current list into submission tables
 * - Locks preferences (is_locked = 1)
 * ===================================================== */
exports.submitPreferences = async (req, res) => {
  const studentId = req.user?.user_id;
  const cycleId = req.cycle?.cycle_id; // set by your active-cycle middleware

  if (!studentId) return res.status(401).json({ message: 'Unauthorized' });
  if (!cycleId)   return res.status(403).json({ message: 'No active allocation cycle.' });

  const conn = await db.getConnection(); // mysql2 pool connection
  try {
    await conn.beginTransaction();

    // 1) Read current (unlocked OR locked — we snapshot what's there) preferences for this cycle
    const [prefs] = await conn.query(
      `SELECT preference_id, project_id, preference_order, contacted_supervisor, is_locked
         FROM preferences
        WHERE student_id = ? AND cycle_id = ?
        ORDER BY preference_order ASC`,
      [studentId, cycleId]
    );

    if (prefs.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'Add at least one preference before submitting.' });
    }

    // If already locked, treat as already submitted (idempotent UX)
    const alreadyLocked = prefs.every(p => p.is_locked === 1);
    if (alreadyLocked) {
      await conn.rollback();
      return res.status(200).json({ message: 'Preferences already submitted.' });
    }

    // 2) Validate contacted flags
    const bad = prefs.find(p => !VALID_CONTACT.includes(p.contacted_supervisor));
    if (bad) {
      await conn.rollback();
      return res.status(400).json({
        message: "Please set 'Have you contacted the supervisor?' to 'Yes' or 'No' for all preferences."
      });
    }

    // 3) Upsert submission header (one per student/cycle)
    await conn.query(
      `INSERT INTO preference_submissions (student_id, cycle_id, submitted_at, processed)
       VALUES (?, ?, NOW(), 0)
       ON DUPLICATE KEY UPDATE submitted_at = NOW(), processed = 0`,
      [studentId, cycleId]
    );

    // 4) Get submission_id
    const [[sub]] = await conn.query(
      `SELECT submission_id
         FROM preference_submissions
        WHERE student_id = ? AND cycle_id = ?`,
      [studentId, cycleId]
    );
    const submissionId = sub.submission_id;

    // 5) Rewrite snapshot items to match current prefs
    await conn.query(
      `DELETE FROM preference_submission_items WHERE submission_id = ?`,
      [submissionId]
    );

    const values = prefs.map(p => [
      submissionId,
      p.project_id,
      p.preference_order,
      p.contacted_supervisor
    ]);
    await conn.query(
      `INSERT INTO preference_submission_items
         (submission_id, project_id, pref_order, contacted_supervisor)
       VALUES ?`,
      [values]
    );

    // 6) Lock the editable prefs so the student can’t change after submit
    await conn.query(
      `UPDATE preferences
          SET is_locked = 1
        WHERE student_id = ? AND cycle_id = ?`,
      [studentId, cycleId]
    );

    await conn.commit();
    return res.json({ message: 'Preferences submitted successfully.' });
  } catch (err) {
    await conn.rollback();
    console.error('Error submitting preferences:', err);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    conn.release?.();
  }
};