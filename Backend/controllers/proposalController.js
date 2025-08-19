// controllers/proposalController.js
const db = require('../config/db');
const path = require('path');
const fs = require('fs');

/** small helper to remove a file if we fail after upload */
function removeIfExists(filePathAbs) {
  try { if (filePathAbs && fs.existsSync(filePathAbs)) fs.unlinkSync(filePathAbs); } catch (_) {}
}

/** active cycle helper */
async function getActiveCycleId() {
  // Prefer status flag
  const [byStatus] = await db.query(
    `SELECT cycle_id
       FROM allocation_cycles
      WHERE status='open'
      ORDER BY submission_open_at DESC
      LIMIT 1`
  );
  if (byStatus.length) return byStatus[0].cycle_id;

  // Fallback to date window
  const [byDate] = await db.query(
    `SELECT cycle_id
       FROM allocation_cycles
      WHERE NOW() BETWEEN submission_open_at AND submission_close_at
      ORDER BY submission_open_at DESC
      LIMIT 1`
  );
  return byDate.length ? byDate[0].cycle_id : null;
}

/**
 * GET /proposals/supervisors/accepting-ideas
 * Returns supervisors who opted-in to accept student ideas AND still have seats left.
 */
exports.listAcceptingSupervisors = async (_req, res) => {
  try {
    const cycleId = await getActiveCycleId();
    if (!cycleId) return res.json([]);

    const [rows] = await db.query(
      `
      SELECT
        u.user_id AS supervisor_id,
        u.name,
        u.email,
        pool.quota,
        GREATEST(pool.quota - COALESCE(taken.cnt, 0), 0) AS seats_left
      FROM projects AS pool
      JOIN users u
        ON u.user_id = pool.supervisor_id
      LEFT JOIN (
        -- Only count allocations that came from *student ideas* in this cycle
        SELECT a.supervisor_id, a.cycle_id, COUNT(*) AS cnt
        FROM allocations a
        JOIN proposals pr ON pr.proposal_id = a.proposal_id
        WHERE a.status = 'allocated'
          AND pr.project_id IS NULL     -- proposal not tied to a supervisor project
        GROUP BY a.supervisor_id, a.cycle_id
      ) AS taken
        ON taken.supervisor_id = pool.supervisor_id
       AND taken.cycle_id      = pool.cycle_id
      WHERE
            pool.cycle_id        = ?
        AND pool.is_archived     = 0
        AND pool.approval_status = 'approved'
        AND (pool.is_student_pool = 1 OR pool.topic = 'Student Proposal Ideas')
      HAVING seats_left > 0
      ORDER BY u.name
      `,
      [cycleId]
    );

    res.json(rows);
  } catch (err) {
    console.error('listAcceptingSupervisors error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};


/**
 * POST /proposals
 * Body (multipart/form-data):
 *  - title          (required)
 *  - description    (required)
 *  - supervisor_id  (required)
 *  - topic_id       (required)
 *  - file           (optional)
 *
 * Only allows supervisors who opted-in to accept student ideas this cycle.
 * Also stamps the proposal with the current cycle_id.
 */
exports.submitProposal = async (req, res) => {
  const studentId = req.user?.user_id; // from verifyToken middleware
  const { supervisor_id, title, description, topic_id } = req.body || {};
  const file = req.file || null;

  if (!studentId) return res.status(401).json({ message: 'Unauthorized' });
  if (!title || !description || !supervisor_id) {
    return res.status(400).json({ message: 'Title, description, and supervisor are required.' });
  }

  // --- Topic validation (REQUIRED) ---
  const topicId = Number(topic_id);
  if (!Number.isInteger(topicId)) {
    return res.status(400).json({ message: 'Topic is required.' });
  }
  // Validate topic exists (and active, if you use that flag)
  const [topicRows] = await db.query(
    'SELECT topic_id FROM topics WHERE topic_id = ? AND is_active = 1 LIMIT 1',
    [topicId]
  );
  if (!topicRows.length) {
    return res.status(400).json({ message: 'Invalid topic.' });
  }

  let absToRemove = null;
  try {
    // 0) active cycle
    const cycleId = await getActiveCycleId();
    if (!cycleId) {
      if (req.file?.path) absToRemove = path.isAbsolute(req.file.path) ? req.file.path : path.join(process.cwd(), req.file.path);
      return res.status(409).json({ message: 'Submissions are closed (no active cycle).' });
    }

    // 1) Validate supervisor role
    const supId = Number(supervisor_id);
    if (!Number.isInteger(supId)) {
      if (req.file?.path) absToRemove = path.isAbsolute(req.file.path) ? req.file.path : path.join(process.cwd(), req.file.path);
      return res.status(400).json({ message: 'Invalid supervisor id.' });
    }

    const [supRows] = await db.query(
      `SELECT user_id, name, email
         FROM users
        WHERE user_id = ? AND role = 'supervisor'
        LIMIT 1`,
      [supId]
    );
    if (supRows.length === 0) {
      if (req.file?.path) absToRemove = path.isAbsolute(req.file.path) ? req.file.path : path.join(process.cwd(), req.file.path);
      return res.status(400).json({ message: 'Selected supervisor not found.' });
    }
    const supervisor = supRows[0];

    // 2) Ensure this supervisor is accepting student ideas AND has seats left
    const [poolRows] = await db.query(
      `
      SELECT pool.project_id, pool.quota, pool.status,
             (pool.quota - COALESCE(taken.cnt,0)) AS seats_left
      FROM projects AS pool
      LEFT JOIN (
        SELECT a.supervisor_id, a.cycle_id, COUNT(*) AS cnt
        FROM allocations a
        JOIN proposals pr ON pr.proposal_id = a.proposal_id
        WHERE a.status='allocated' AND pr.project_id IS NULL
        GROUP BY a.supervisor_id, a.cycle_id
      ) AS taken
        ON taken.supervisor_id = pool.supervisor_id
       AND taken.cycle_id      = pool.cycle_id
      WHERE pool.is_student_pool = 1
        AND pool.cycle_id       = ?
        AND pool.supervisor_id  = ?
        AND pool.status         = 'open'
      LIMIT 1
      `,
      [cycleId, supId]
    );

    if (!poolRows.length) {
      if (req.file?.path) absToRemove = path.isAbsolute(req.file.path) ? req.file.path : path.join(process.cwd(), req.file.path);
      return res.status(400).json({
        message: 'This supervisor is not accepting student proposals this cycle.',
      });
    }
    if ((poolRows[0].seats_left ?? 0) <= 0) {
      if (req.file?.path) absToRemove = path.isAbsolute(req.file.path) ? req.file.path : path.join(process.cwd(), req.file.path);
      return res.status(400).json({
        message: 'Supervisor’s student-idea quota is currently full.',
      });
    }

    // 3) Insert proposal (include cycle_id AND topic_id)
    const storedFilename = file ? file.filename : null;
    const [result] = await db.query(
      `INSERT INTO proposals
         (student_id, supervisor_id, cycle_id, topic_id, title, description, submitted_at, file_path)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)`,
      [studentId, supId, cycleId, topicId, title, description, storedFilename]
    );

    return res.status(201).json({
      message: 'Proposal submitted successfully.',
      proposal_id: result.insertId,
      file_path: storedFilename,
      supervisor: { user_id: supervisor.user_id, name: supervisor.name, email: supervisor.email },
    });
  } catch (err) {
    console.error('Error submitting proposal:', err);
    if (absToRemove) removeIfExists(absToRemove);
    else if (req.file?.path) {
      const abs = path.isAbsolute(req.file.path) ? req.file.path : path.join(process.cwd(), req.file.path);
      removeIfExists(abs);
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * GET /proposals (student’s own)
 */
exports.getProposalsByStudent = async (req, res) => {
  const studentId = req.user?.user_id; // from auth middleware
  if (!studentId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const [rows] = await db.query(
      `
      SELECT
        p.proposal_id   AS proposal_id,
        p.title,
        p.description,
        p.submitted_at,
        p.file_path,
        p.supervisor_id,
        u.name          AS supervisor_name,
        u.email         AS supervisor_email,
        p.status        AS status,
        p.topic_id,
        t.name          AS topic_name
      FROM proposals p
      LEFT JOIN users  u ON u.user_id  = p.supervisor_id
      LEFT JOIN topics t ON t.topic_id = p.topic_id
      WHERE p.student_id = ?
      ORDER BY p.submitted_at DESC, p.proposal_id DESC
      `,
      [studentId]
    );

    return res.json(rows || []);
  } catch (err) {
    console.error('Error retrieving proposals:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
