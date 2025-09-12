// controllers/proposalController.js
const db = require('../config/db');
const path = require('path');
const fs = require('fs');

/* -------------------------------------------------------
 * File helpers
 * ----------------------------------------------------- */
function removeIfExists(filePathAbs) {
  try {
    if (filePathAbs && fs.existsSync(filePathAbs)) fs.unlinkSync(filePathAbs);
  } catch (_) {}
}
function absPathFromReqFile(file) {
  if (!file?.path) return null;
  return path.isAbsolute(file.path) ? file.path : path.join(process.cwd(), file.path);
}

/* -------------------------------------------------------
 * Constants
 * ----------------------------------------------------- */
const STUDENT_POOL_TOPIC = 'Student Proposal Ideas';

/* -------------------------------------------------------
 * Cycle helpers (prefer explicit -> active -> recent)
 * ----------------------------------------------------- */
async function getMostRecentCycleId() {
  const [r] = await db.query(
    `SELECT cycle_id FROM allocation_cycles ORDER BY submission_open_at DESC, cycle_id DESC LIMIT 1`
  );
  return r.length ? r[0].cycle_id : null;
}
async function getActiveCycleId() {
  const [byStatus] = await db.query(
    `SELECT cycle_id FROM allocation_cycles
      WHERE status='open'
      ORDER BY submission_open_at DESC
      LIMIT 1`
  );
  if (byStatus.length) return byStatus[0].cycle_id;

  const [byDate] = await db.query(
    `SELECT cycle_id FROM allocation_cycles
      WHERE NOW() BETWEEN submission_open_at AND submission_close_at
      ORDER BY submission_open_at DESC
      LIMIT 1`
  );
  return byDate.length ? byDate[0].cycle_id : null;
}
async function cycleExists(cycleId) {
  const [r] = await db.query(`SELECT 1 FROM allocation_cycles WHERE cycle_id=? LIMIT 1`, [cycleId]);
  return !!r.length;
}
async function resolveCycleId(req) {
  const raw =
    req.query?.cycle_id ?? req.query?.cycleId ??
    req.body?.cycle_id  ?? req.body?.cycleId  ?? null;

  if (raw != null && String(raw).trim() !== '') {
    const cid = Number(raw);
    if (!Number.isInteger(cid) || cid <= 0 || !(await cycleExists(cid))) {
      const err = new Error('Invalid cycle');
      err.status = 409;
      throw err;
    }
    return cid;
  }
  const active = await getActiveCycleId();
  if (active) return active;
  const recent = await getMostRecentCycleId();
  if (recent) return recent;

  const err = new Error('No active cycle');
  err.status = 409;
  throw err;
}

/**
 * GET /proposals/supervisors/accepting-ideas?cycle_id=#
 * Return supervisors who have a student-idea pool with seats.
 */
exports.listAcceptingSupervisors = async (req, res) => {
  try {
    let cycleId;
    try {
      cycleId = await resolveCycleId(req);
    } catch (e) {
      res.set('Cache-Control', 'no-store');
      return res.json([]);
    }

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
        SELECT a.supervisor_id, a.cycle_id, COUNT(*) AS cnt
        FROM allocations a
        JOIN proposals pr ON pr.proposal_id = a.proposal_id
        WHERE a.cycle_id = ?
          AND a.status = 'allocated'
          AND pr.project_id IS NULL
        GROUP BY a.supervisor_id, a.cycle_id
      ) AS taken
        ON taken.supervisor_id = pool.supervisor_id
       AND taken.cycle_id      = pool.cycle_id
      WHERE
            pool.cycle_id     = ?
        AND pool.is_archived  = 0
        AND pool.quota        > 0
        -- IMPORTANT: do NOT require approval for student-idea pools
        AND (
              pool.is_student_pool = 1
           OR  pool.topic = ?
           OR  pool.topic LIKE CONCAT(?, ':%')
        )
      HAVING seats_left > 0
      ORDER BY u.name
      `,
      [cycleId, cycleId, STUDENT_POOL_TOPIC, STUDENT_POOL_TOPIC]
    );

    res.set('Cache-Control', 'no-store');
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
 *  - supervisor_id  (required; users.user_id with role='supervisor')
 *  - file           (optional)
 *
 * Only allows supervisors who are accepting student ideas in the resolved cycle.
 * Stamps the proposal with that cycle_id.
 */
exports.submitProposal = async (req, res) => {
  const studentId = req.user?.user_id;
  const { supervisor_id, title, description } = req.body || {};
  const file = req.file || null;

  if (!studentId) return res.status(401).json({ message: 'Unauthorized' });
  if (!title || !description || !supervisor_id) {
    if (file) removeIfExists(absPathFromReqFile(file));
    return res.status(400).json({ message: 'Title, description, and supervisor are required.' });
  }

  let absToRemove = absPathFromReqFile(file);

  try {
    const cycleId = await resolveCycleId(req); 

    // Validate supervisor
    const supId = Number(supervisor_id);
    if (!Number.isInteger(supId) || supId <= 0) {
      removeIfExists(absToRemove);
      return res.status(400).json({ message: 'Invalid supervisor id.' });
    }

    const [supRows] = await db.query(
      `SELECT user_id, name, email
         FROM users
        WHERE user_id = ? AND role = 'supervisor'
        LIMIT 1`,
      [supId]
    );
    if (!supRows.length) {
      removeIfExists(absToRemove);
      return res.status(400).json({ message: 'Selected supervisor not found.' });
    }
    const supervisor = supRows[0];

    const [poolRows] = await db.query(
      `
      SELECT 
        pool.project_id,
        pool.quota,
        GREATEST(pool.quota - COALESCE(taken.cnt, 0), 0) AS seats_left
      FROM projects AS pool
      LEFT JOIN (
        SELECT a.supervisor_id, a.cycle_id, COUNT(*) AS cnt
        FROM allocations a
        JOIN proposals pr ON pr.proposal_id = a.proposal_id
        WHERE a.cycle_id = ?
          AND a.status = 'allocated'
          AND pr.project_id IS NULL
        GROUP BY a.supervisor_id, a.cycle_id
      ) AS taken
        ON taken.supervisor_id = pool.supervisor_id
       AND taken.cycle_id      = pool.cycle_id
      WHERE
            pool.cycle_id       = ?
        AND pool.supervisor_id = ?
        AND pool.is_archived   = 0
        AND pool.quota         > 0
        AND (
              pool.is_student_pool = 1
           OR pool.topic = ?
           OR pool.topic LIKE CONCAT(?, ':%')
        )
      LIMIT 1
      `,
      [cycleId, cycleId, supId, STUDENT_POOL_TOPIC, STUDENT_POOL_TOPIC]
    );

    if (!poolRows.length) {
      removeIfExists(absToRemove);
      return res.status(400).json({
        message: 'This supervisor is not accepting student proposals this cycle.',
      });
    }
    if ((poolRows[0].seats_left ?? 0) <= 0) {
      removeIfExists(absToRemove);
      return res.status(400).json({
        message: 'Supervisor’s student-idea quota is currently full.',
      });
    }

    const [[dup]] = await db.query(
      `SELECT proposal_id FROM proposals
        WHERE student_id=? AND supervisor_id=? AND cycle_id=? AND status IN ('pending','submitted','under_review')
        LIMIT 1`,
      [studentId, supId, cycleId]
    );
    if (dup) {
      removeIfExists(absToRemove);
      return res.status(409).json({ message: 'You already have a proposal pending with this supervisor in this cycle.' });
    }

    const storedFilename = file ? file.filename : null;
    const [result] = await db.query(
      `INSERT INTO proposals
         (student_id, supervisor_id, cycle_id, topic_id, title, description, submitted_at, file_path, status, project_id)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, 'pending', NULL)`,
      [studentId, supId, cycleId, null, title, description, storedFilename]
    );

    absToRemove = null;

    res.set('Cache-Control', 'no-store');
    return res.status(201).json({
      message: 'Proposal submitted successfully.',
      proposal_id: result.insertId,
      file_path: storedFilename,
      supervisor: { user_id: supervisor.user_id, name: supervisor.name, email: supervisor.email },
      cycle_id: cycleId,
    });
  } catch (err) {
    console.error('Error submitting proposal:', err);
    if (absToRemove) removeIfExists(absToRemove);
    return res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
  }
};

/**
 * GET /proposals (student’s own)
 * Optional: ?cycle_id=#
 * If cycle_id not provided, returns proposals across all cycles (latest first).
 */
exports.getProposalsByStudent = async (req, res) => {
  const studentId = req.user?.user_id;
  if (!studentId) return res.status(401).json({ message: 'Unauthorized' });

  const raw = req.query?.cycle_id ?? req.query?.cycleId;
  const hasCycle = raw != null && String(raw).trim() !== '';
  const cycleId = hasCycle ? Number(raw) : null;

  const baseSQL = `
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
      p.cycle_id
    FROM proposals p
    LEFT JOIN users  u ON u.user_id  = p.supervisor_id
    WHERE p.student_id = ?
    ${hasCycle ? 'AND p.cycle_id = ?' : ''}
    ORDER BY p.submitted_at DESC, p.proposal_id DESC
  `;

  try {
    const sqlWithTopics = baseSQL.replace(
      'FROM proposals p',
      `FROM proposals p LEFT JOIN topics t ON t.topic_id = p.topic_id`
    ).replace(
      'p.topic_id,',
      'p.topic_id, t.name AS topic_name,'
    );

    const params = hasCycle ? [studentId, cycleId] : [studentId];
    const [rows] = await db.query(sqlWithTopics, params);

    res.set('Cache-Control', 'no-store');
    return res.json(rows || []);
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      try {
        const params = hasCycle ? [studentId, cycleId] : [studentId];
        const [rows] = await db.query(baseSQL, params);
        rows.forEach(r => { if (!('topic_name' in r)) r.topic_name = null; });
        res.set('Cache-Control', 'no-store');
        return res.json(rows || []);
      } catch (e2) {
        console.error('Error retrieving proposals (fallback):', e2);
        return res.status(500).json({ message: 'Internal server error' });
      }
    }
    console.error('Error retrieving proposals:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
