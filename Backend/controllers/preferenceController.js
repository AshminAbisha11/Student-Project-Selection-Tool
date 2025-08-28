// controllers/preferenceController.js
const db = require('../config/db');

const VALID_CONTACT = ['Yes', 'No'];

/* ---------------- Cycle helpers ---------------- */
async function getMostRecentCycleId() {
  const [r] = await db.query(
    `SELECT cycle_id FROM allocation_cycles ORDER BY submission_open_at DESC LIMIT 1`
  );
  return r.length ? r[0].cycle_id : null;
}

async function getActiveCycleId() {
  const [byStatus] = await db.query(
    `SELECT cycle_id FROM allocation_cycles WHERE status='open' ORDER BY submission_open_at DESC LIMIT 1`
  );
  if (byStatus.length) return byStatus[0].cycle_id;

  const [byDate] = await db.query(
    `SELECT cycle_id FROM allocation_cycles WHERE NOW() BETWEEN submission_open_at AND submission_close_at ORDER BY submission_open_at DESC LIMIT 1`
  );
  return byDate.length ? byDate[0].cycle_id : null;
}

async function cycleExists(cycleId) {
  const [r] = await db.query(
    `SELECT 1 FROM allocation_cycles WHERE cycle_id=? LIMIT 1`,
    [cycleId]
  );
  return !!r.length;
}

/** Prefer cycle in req (query/body), else active, else most recent. */
async function resolveCycleId(req) {
  const raw =
    req.query?.cycle_id ?? req.query?.cycleId ??
    req.body?.cycle_id  ?? req.body?.cycleId  ??
    req.cycle?.cycle_id ?? null;

  if (raw != null && String(raw).trim() !== '') {
    const cid = Number(raw);
    if (!Number.isInteger(cid) || cid <= 0 || !(await cycleExists(cid))) {
      const err = new Error('Invalid cycle_id');
      err.status = 400;
      throw err;
    }
    return cid;
  }

  const active = await getActiveCycleId();
  if (active) return active;

  const recent = await getMostRecentCycleId();
  if (recent) return recent;

  const err = new Error('No active cycle');
  err.status = 403;
  throw err;
}

/* ---------------- Helpers ---------------- */
async function repackOrders(studentId, cycleId, connOrPool = db) {
  const [rows] = await connOrPool.query(
    `SELECT preference_id
       FROM preferences
      WHERE student_id = ? AND cycle_id = ?
      ORDER BY preference_order ASC`,
    [studentId, cycleId]
  );
  for (let i = 0; i < rows.length; i++) {
    await connOrPool.query(
      `UPDATE preferences SET preference_order = ? WHERE preference_id = ?`,
      [i + 1, rows[i].preference_id]
    );
  }
}

/* =======================================================
 * GET /preferences   (?cycle_id=)
 * ===================================================== */
exports.getPreferencesByStudent = async (req, res) => {
  const studentId = req.user?.user_id;
  if (!studentId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const cycleId = await resolveCycleId(req);

    const [rows] = await db.query(
      `
      SELECT
        p.preference_id,
        p.preference_order,
        p.project_id,
        p.contacted_supervisor,
        p.cycle_id,
        p.is_locked,
        pr.title,
        pr.description,
        pr.supervisor_name
      FROM preferences p
      JOIN projects pr ON p.project_id = pr.project_id
      WHERE p.student_id = ?
        AND p.cycle_id   = ?
      ORDER BY p.preference_order
      `,
      [studentId, cycleId]
    );

    return res.status(200).json(rows || []);
  } catch (err) {
    const code = err.status || 500;
    if (code !== 500) return res.status(code).json({ message: err.message });
    console.error('Error fetching preferences:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};

/* =======================================================
 * GET /preferences/submission
 * ===================================================== */
exports.getSubmissionStatus = async (req, res) => {
  try {
    const studentId = req.user?.user_id;
    if (!studentId) return res.status(401).json({ message: 'Unauthorized' });

    const cycleId = await resolveCycleId(req);

    const [rows] = await db.query(
      `SELECT MAX(submitted_at) AS submitted_at
         FROM preference_submissions
        WHERE student_id = ? AND cycle_id = ?`,
      [studentId, cycleId]
    );

    const submitted_at = rows?.[0]?.submitted_at || null;
    res.json({ submitted: Boolean(submitted_at), submitted_at, cycle_id: cycleId });
  } catch (e) {
    const code = e.status || 500;
    if (code !== 500) return res.status(code).json({ message: e.message });
    console.error('getSubmissionStatus error:', e);
    res.status(500).json({ message: 'Server error' });
  }
};

/* =======================================================
 * POST /preferences  -> add a preference  (body: project_id, [cycle_id])
 * ===================================================== */
exports.addPreference = async (req, res) => {
  const student_id = req.user?.user_id;
  if (!student_id) return res.status(401).json({ message: 'Unauthorized' });

  const { project_id } = req.body || {};
  const projectId = Number(project_id);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ message: 'valid project_id is required' });
  }

  try {
    const cycleId = await resolveCycleId(req);

    // validate project belongs to the same cycle and is usable
    const [[proj]] = await db.query(
      `SELECT project_id, cycle_id, approval_status, is_archived
         FROM projects
        WHERE project_id = ?`,
      [projectId]
    );
    if (!proj) return res.status(404).json({ message: 'Project not found' });
    if (Number(proj.cycle_id) !== Number(cycleId))
      return res.status(409).json({ message: 'Project is not in this cycle' });
    if (String(proj.approval_status || '').toLowerCase() !== 'approved' || Number(proj.is_archived) === 1)
      return res.status(409).json({ message: 'Project is not available' });

    const [existing] = await db.query(
      `SELECT project_id
         FROM preferences
        WHERE student_id = ? AND cycle_id = ?
        ORDER BY preference_order ASC`,
      [student_id, cycleId]
    );

    if (existing.length >= 5) {
      return res.status(400).json({ message: 'You can only add up to 5 preferences.' });
    }
    if (existing.some(p => Number(p.project_id) === projectId)) {
      return res.status(409).json({ message: 'This project is already in your preferences.' });
    }

    const preference_order = existing.length + 1;
    const contacted_supervisor = 'No';

    const [result] = await db.query(
      `INSERT INTO preferences
         (student_id, cycle_id, project_id, preference_order, contacted_supervisor, is_locked, created_at)
       VALUES (?, ?, ?, ?, ?, 0, NOW())`,
      [student_id, cycleId, projectId, preference_order, contacted_supervisor]
    );

    return res.status(201).json({
      message: 'Preference added successfully',
      preference_id: result.insertId,
      project_id: projectId,
      preference_order,
      contacted_supervisor,
      cycle_id: cycleId,
      is_locked: 0,
    });
  } catch (err) {
    const code = err.status || 500;
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Duplicate preference for this project.' });
    }
    if (code !== 500) return res.status(code).json({ message: err.message });
    console.error('Error adding preference:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};

/* =======================================================
 * PUT /preferences -> update order (reposition inside this cycle)
 * body: { preference_id, preference_order }
 * ===================================================== */
exports.updatePreferenceOrder = async (req, res) => {
  const studentId = req.user?.user_id;
  if (!studentId) return res.status(401).json({ message: 'Unauthorized' });

  const prefId = Number(req.body?.preference_id);
  const newPos = Number(req.body?.preference_order);

  if (!Number.isInteger(prefId) || !Number.isInteger(newPos) || newPos < 1) {
    return res.status(400).json({ message: 'valid preference_id and preference_order are required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // locate the row + cycle
    const [[row]] = await conn.query(
      `SELECT cycle_id FROM preferences WHERE preference_id = ? AND student_id = ?`,
      [prefId, studentId]
    );
    if (!row) {
      await conn.rollback();
      return res.status(404).json({ message: 'Preference not found' });
    }
    const cycleId = row.cycle_id;

    // pull all prefs in this cycle
    const [all] = await conn.query(
      `SELECT preference_id FROM preferences WHERE student_id=? AND cycle_id=? ORDER BY preference_order ASC`,
      [studentId, cycleId]
    );
    if (!all.length) {
      await conn.rollback();
      return res.status(404).json({ message: 'No preferences to reorder' });
    }

    // build new order list
    const ids = all.map(r => r.preference_id);
    const fromIdx = ids.indexOf(prefId);
    if (fromIdx === -1) {
      await conn.rollback();
      return res.status(404).json({ message: 'Preference not found in cycle' });
    }
    ids.splice(fromIdx, 1);
    const target = Math.min(Math.max(newPos, 1), ids.length + 1);
    ids.splice(target - 1, 0, prefId);

    // phase 1: bump all orders to avoid unique collisions
    await conn.query(
      `UPDATE preferences SET preference_order = preference_order + 100
        WHERE student_id=? AND cycle_id=?`,
      [studentId, cycleId]
    );

    // phase 2: write normalized order
    for (let i = 0; i < ids.length; i++) {
      await conn.query(
        `UPDATE preferences SET preference_order = ? WHERE preference_id = ?`,
        [i + 1, ids[i]]
      );
    }

    await conn.commit();
    return res.json({ message: 'Preference order updated successfully' });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    console.error('Error updating preference order:', err);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    try { await conn.release(); } catch {}
  }
};

/* =======================================================
 * PATCH /preferences/contacted
 * ===================================================== */
exports.updateContactedSupervisor = async (req, res) => {
  const studentId = req.user?.user_id;
  if (!studentId) return res.status(401).json({ message: 'Unauthorized' });

  let { preference_id, contacted_supervisor } = req.body || {};
  const prefId = Number(preference_id);
  const v = String(contacted_supervisor || '').trim().toLowerCase();
  if (v !== 'yes' && v !== 'no') {
    return res.status(400).json({ message: "contacted_supervisor must be 'Yes' or 'No'" });
  }
  contacted_supervisor = v === 'yes' ? 'Yes' : 'No';

  if (!Number.isInteger(prefId)) {
    return res.status(400).json({ message: 'valid preference_id is required' });
  }

  try {
    const [result] = await db.query(
      `UPDATE preferences
          SET contacted_supervisor = ?
        WHERE preference_id = ? AND student_id = ?`,
      [contacted_supervisor, prefId, studentId]
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
 * ===================================================== */
exports.deletePreference = async (req, res) => {
  const preferenceId = Number(req.params.preferenceId);
  const studentId = req.user?.user_id;

  if (!studentId) return res.status(401).json({ message: 'Unauthorized' });
  if (!Number.isInteger(preferenceId)) return res.status(400).json({ message: 'valid preferenceId is required' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[row]] = await conn.query(
      `SELECT cycle_id FROM preferences WHERE preference_id = ? AND student_id = ?`,
      [preferenceId, studentId]
    );
    if (!row) {
      await conn.rollback();
      return res.status(404).json({ message: 'Preference not found' });
    }
    const cycleId = row.cycle_id;

    const [del] = await conn.query(
      `DELETE FROM preferences WHERE preference_id = ? AND student_id = ?`,
      [preferenceId, studentId]
    );
    if (!del.affectedRows) {
      await conn.rollback();
      return res.status(404).json({ message: 'Preference not found' });
    }

    await repackOrders(studentId, cycleId, conn);
    await conn.commit();
    return res.status(200).json({ message: 'Preference deleted and reordered successfully' });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    console.error('Error deleting/reordering preference:', err);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    try { await conn.release(); } catch {}
  }
};

/* =======================================================
 * POST /preferences/submit -> lock + snapshot (idempotent)
 * Body: { cycle_id (or cycleId), preferences: [project_id, ...] }
 * ===================================================== */
// controllers/preferenceController.js  — replace ONLY this handler

exports.submitPreferences = async (req, res) => {
  const studentId = req.user?.user_id;
  if (!studentId) return res.status(401).json({ message: 'Unauthorized' });

  // Accept cycle_id or cycleId; coerce/fallback to active if missing/invalid
  let cycleId;
  try {
    cycleId = await resolveCycleId(req);
  } catch (e) {
    return res.status(e.status || 400).json({ message: e.message || 'Invalid cycle_id' });
  }

  // Validate and clean preference list
  const rawPrefs = Array.isArray(req.body?.preferences) ? req.body.preferences : [];
  if (rawPrefs.length === 0) {
    return res.status(400).json({ message: 'preferences must be a non-empty array of project_id' });
  }
  const clean = [...new Set(rawPrefs.map(Number))]
    .filter(n => Number.isInteger(n) && n > 0)
    .slice(0, 5);
  if (clean.length === 0) {
    return res.status(400).json({ message: 'No valid project_id in preferences' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1) UPSERT the submission record (idempotent)
    await conn.query(
      `
      INSERT INTO preference_submissions (student_id, cycle_id, submitted_at, processed)
      VALUES (?, ?, NOW(), 0)
      ON DUPLICATE KEY UPDATE
        submitted_at = VALUES(submitted_at),
        processed    = VALUES(processed)
      `,
      [studentId, cycleId]
    );

    // 2) Preserve existing contacted_supervisor flags (Yes/No)
    const [existingRows] = await conn.query(
      `SELECT project_id, contacted_supervisor
         FROM preferences
        WHERE student_id = ? AND cycle_id = ?`,
      [studentId, cycleId]
    );
    const contactedByProject = Object.fromEntries(
      existingRows.map(r => [Number(r.project_id), r.contacted_supervisor || 'No'])
    );

    // 3) Replace this student's preferences for the cycle with the provided order
    await conn.query(
      `DELETE FROM preferences WHERE student_id = ? AND cycle_id = ?`,
      [studentId, cycleId]
    );

    const rows = clean.map((projectId, idx) => [
      studentId,
      cycleId,
      projectId,
      idx + 1,                                      // preference_order (1..N)
      contactedByProject[projectId] || 'No'         // preserve earlier flag, default 'No'
    ]);

    // NOTE: your preferences table columns (per screenshot):
    // preference_id, student_id, cycle_id, project_id, preference_order, contacted_supervisor, is_locked, created_at
    await conn.query(
      `
      INSERT INTO preferences
        (student_id, cycle_id, project_id, preference_order, contacted_supervisor, is_locked, created_at)
      VALUES
        ${rows.map(() => '(?, ?, ?, ?, ?, 0, NOW())').join(',')}
      `,
      rows.flat()
    );

    await conn.commit();
    res.json({ ok: true, cycle_id: cycleId, saved: rows.length });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    if (e.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ message: 'Invalid project_id or FK mismatch', detail: e.sqlMessage });
    }
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Duplicate preference detected' });
    }
    console.error('submitPreferences error:', e);
    res.status(500).json({ message: 'Failed to submit preferences' });
  } finally {
    try { await conn.release(); } catch {}
  }
};

