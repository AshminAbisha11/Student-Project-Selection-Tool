// controllers/supervisorController.js
const db = require('../config/db');

/* ---------------- Helpers: cycle ---------------- */
async function getActiveCycleId() {
  const [byStatus] = await db.query(
    `SELECT cycle_id
       FROM allocation_cycles
      WHERE status='open'
      ORDER BY submission_open_at DESC
      LIMIT 1`
  );
  if (byStatus.length) return byStatus[0].cycle_id;

  const [byDate] = await db.query(
    `SELECT cycle_id
       FROM allocation_cycles
      WHERE NOW() BETWEEN submission_open_at AND submission_close_at
      ORDER BY submission_open_at DESC
      LIMIT 1`
  );
  return byDate.length ? byDate[0].cycle_id : null;
}

async function cycleExists(id) {
  const [r] = await db.query(`SELECT 1 FROM allocation_cycles WHERE cycle_id=? LIMIT 1`, [id]);
  return r.length > 0;
}

/* ---------------- Handlers ---------------- */

// GET /supervisor (list supervisors)
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

// GET /supervisor/proposals (received proposals for this supervisor)
exports.getReceivedProposals = async (req, res) => {
  try {
    const supervisorId = req.user?.user_id;
    if (!supervisorId) return res.status(401).json({ message: 'Unauthorized' });

    const [rows] = await db.query(
      `
      SELECT 
        p.proposal_id,
        p.project_id,
        pr.title AS project_title,
        u.user_id AS student_id,
        u.name     AS student_name,
        u.email    AS student_email,
        p.title    AS proposal_title,
        p.description AS message,
        p.status,
        p.submitted_at AS created_at,
        p.file_path,
        p.cycle_id,
        CASE WHEN p.project_id IS NULL THEN 'student_proposal' ELSE 'supervisor_project' END AS source_type,
        COALESCE(pr.title, p.title) AS display_title
      FROM proposals p
      LEFT JOIN projects pr ON pr.project_id = p.project_id
      JOIN users u          ON u.user_id = p.student_id
      WHERE p.supervisor_id = ?
      ORDER BY p.submitted_at DESC
      `,
      [supervisorId]
    );

    res.json(rows || []);
  } catch (err) {
    console.error('getReceivedProposals error:', err);
    res.status(500).json({ message: 'Failed to fetch proposals' });
  }
};

// PATCH /supervisor/proposals/:id/decision  { status: 'accepted'|'rejected'|'under_review', reason?: string }
exports.decideProposal = async (req, res) => {
  let conn;
  try {
    const supervisorId = req.user?.user_id;
    const proposalId = Number(req.params.id);
    const { status, reason } = req.body || {};

    if (!supervisorId) return res.status(401).json({ message: 'Unauthorized' });
    if (!proposalId) return res.status(400).json({ message: 'proposalId required' });

    const normalized = String(status || '').toLowerCase();
    const allowed = new Set(['accepted', 'rejected', 'under_review']);
    if (!allowed.has(normalized)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    if (reason && String(reason).length > 1000) {
      return res.status(400).json({ message: 'Reason too long (max 1000 chars)' });
    }

    // Load the proposal first
    const [[p]] = await db.query(
      `SELECT proposal_id, student_id, supervisor_id, project_id, cycle_id
         FROM proposals
        WHERE proposal_id=? AND supervisor_id=?`,
      [proposalId, supervisorId]
    );
    if (!p) return res.status(404).json({ message: 'Proposal not found' });

    // Only need transaction if accepting a student idea (project_id is NULL)
    if (normalized === 'accepted' && p.project_id == null) {
      conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        // Lock/choose the pool row for update
        const [[pool]] = await conn.query(
          `
          SELECT pool.project_id, pool.quota, pool.spots_filled
            FROM projects AS pool
           WHERE pool.is_student_pool = 1
             AND pool.cycle_id       = ?
             AND pool.supervisor_id  = ?
             AND (pool.approval_status IS NULL OR LOWER(pool.approval_status) IN ('open','approved','active'))
           FOR UPDATE
          `,
          [p.cycle_id, supervisorId]
        );

        if (!pool) {
          await conn.rollback();
          conn.release();
          return res.status(409).json({ message: 'No student-idea pool project available.' });
        }

        // Recompute allocated count (source of truth), then check seats
        const [[countRow]] = await conn.query(
          `
          SELECT COUNT(*) AS cnt
            FROM allocations a
            WHERE a.cycle_id = ?
              AND a.supervisor_id = ?
              AND a.project_id = ?
              AND a.status = 'allocated'
          `,
          [p.cycle_id, supervisorId, pool.project_id]
        );
        const allocatedCount = Number(countRow?.cnt || 0);
        const seatsLeft = Math.max(0, Number(pool.quota || 0) - allocatedCount);
        if (seatsLeft <= 0) {
          await conn.rollback();
          conn.release();
          return res.status(409).json({ message: 'No seats available in student-idea pool.' });
        }

        // Insert allocation idempotently
        await conn.query(
          `INSERT IGNORE INTO allocations
             (cycle_id, project_id, student_id, supervisor_id, proposal_id, status, allocated_at)
           VALUES (?, ?, ?, ?, ?, 'allocated', NOW())`,
          [p.cycle_id, pool.project_id, p.student_id, supervisorId, p.proposal_id]
        );

        // Recompute and store spots_filled = min(quota, allocatedCountNow)
        const [[countRow2]] = await conn.query(
          `
          SELECT COUNT(*) AS cnt
            FROM allocations a
            WHERE a.cycle_id = ?
              AND a.supervisor_id = ?
              AND a.project_id = ?
              AND a.status = 'allocated'
          `,
          [p.cycle_id, supervisorId, pool.project_id]
        );
        const allocatedNow = Number(countRow2?.cnt || 0);
        await conn.query(
          `UPDATE projects
              SET spots_filled = LEAST(?, quota)
            WHERE project_id = ?`,
          [allocatedNow, pool.project_id]
        );

        await conn.commit();
        conn.release();
        conn = null;
      } catch (txErr) {
        try { await conn.rollback(); } catch (_) {}
        try { conn.release(); } catch (_) {}
        conn = null;
        throw txErr;
      }
    }

    // Update proposal status + reason (outside or after tx)
    await db.query(
      `UPDATE proposals
          SET status = ?, decision_note = ?, updated_at = CURRENT_TIMESTAMP
        WHERE proposal_id = ? AND supervisor_id = ?`,
      [normalized, reason || null, proposalId, supervisorId]
    );

    const [[updated]] = await db.query(
      `SELECT proposal_id, status, decision_note AS reason, updated_at
         FROM proposals WHERE proposal_id=?`,
      [proposalId]
    );

    res.json(updated);
  } catch (e) {
    console.error('decideProposal error:', e);
    res.status(500).json({ message: 'Failed to update proposal status' });
  } finally {
    // Extra safety: if conn still hanging, release it
    if (conn) {
      try { await conn.rollback(); } catch (_) {}
      try { conn.release(); } catch (_) {}
    }
  }
};

