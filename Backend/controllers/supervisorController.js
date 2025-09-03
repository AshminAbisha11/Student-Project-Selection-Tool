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
  const [r] = await db.query(
    `SELECT 1 FROM allocation_cycles WHERE cycle_id=? LIMIT 1`,
    [id]
  );
  return r.length > 0;
}

/* New: open cycle if available, otherwise latest cycle this supervisor used */
async function getActiveOrLatestCycleIdForSupervisor(supervisorId) {
  const active = await getActiveCycleId();
  if (active) return active;

  const [[latestFromProjects]] = await db.query(
    `SELECT p.cycle_id
       FROM projects p
      WHERE p.supervisor_id = ?
        AND COALESCE(p.is_archived,0) = 0
      ORDER BY COALESCE(p.updated_at, p.created_at) DESC
      LIMIT 1`,
    [supervisorId]
  );
  return latestFromProjects ? latestFromProjects.cycle_id : null;
}

// add this near your other helpers
async function getActiveOrLatestCycleIdForSupervisor(supervisorId) {
  // open cycle first
  const [byStatus] = await db.query(
    `SELECT cycle_id FROM allocation_cycles
      WHERE status='open'
      ORDER BY submission_open_at DESC LIMIT 1`
  );
  if (byStatus.length) return byStatus[0].cycle_id;

  // else: most recent cycle this supervisor actually used
  const [[latestFromProjects]] = await db.query(
    `SELECT p.cycle_id
       FROM projects p
      WHERE p.supervisor_id = ?
        AND COALESCE(p.is_archived,0) = 0
      ORDER BY COALESCE(p.updated_at, p.created_at) DESC
      LIMIT 1`,
    [supervisorId]
  );
  return latestFromProjects ? latestFromProjects.cycle_id : null;
}


/* ---------------- Dashboard Overview ---------------- */
// GET /supervisor/overview
exports.getOverview = async (req, res) => {
  try {
    const supervisorId = req.user?.user_id;
    if (!supervisorId) return res.status(401).json({ message: 'Unauthorized' });

    const [[projRow]] = await db.query(
      `SELECT COUNT(*) AS projects
         FROM projects
        WHERE supervisor_id = ?
          AND COALESCE(is_archived,0) = 0`,
      [supervisorId]
    );

    const [[propRow]] = await db.query(
      `SELECT COUNT(*) AS pendingProposals
         FROM proposals
        WHERE supervisor_id = ?
          AND COALESCE(status,'submitted') IN ('submitted','pending','under_review')`,
      [supervisorId]
    );

    const [[allocRow]] = await db.query(
      `SELECT COUNT(DISTINCT student_id) AS students
         FROM allocations
        WHERE supervisor_id = ?
          AND status = 'allocated'`,
      [supervisorId]
    );

    res.json({
      projects: Number(projRow?.projects || 0),
      pendingProposals: Number(propRow?.pendingProposals || 0),
      studentsAllocated: Number(allocRow?.students || 0),
    });
  } catch (e) {
    console.error('getOverview error:', e);
    res.status(500).json({ message: 'Failed to load overview' });
  }
};

/* ---------------- My Projects listing ---------------- */
// GET /supervisor/projects?tab=active|draft|archived&cycle=active|all|<cycle_id>&q=...
exports.getMyProjects = async (req, res) => {
  try {
    const supervisorId = req.user?.user_id;
    if (!supervisorId) return res.status(401).json({ message: 'Unauthorized' });

    const tab   = String(req.query.tab || 'active').toLowerCase();
    const q     = (req.query.q || '').trim();
    const cycle = String(req.query.cycle || 'active').toLowerCase();

    const params = [supervisorId];
    let where = `WHERE p.supervisor_id = ?`;

    /* ----- cycle filter ----- */
    if (cycle === 'active' || cycle === 'latest') {
      const chosenId = await getActiveOrLatestCycleIdForSupervisor(supervisorId);
      if (chosenId) {
        where += ` AND p.cycle_id = ?`;
        params.push(chosenId);
      } // else: no cycles -> return empty later
    } else if (cycle !== 'all' && /^\d+$/.test(cycle)) {
      where += ` AND p.cycle_id = ?`;
      params.push(Number(cycle));
    }

    /* ----- status filter ----- */
    let statusFilter = '';
    if (tab === 'archived') {
      statusFilter = ` AND (p.is_archived = 1 OR p.status = 'archived')`;
    } else if (tab === 'draft') {
      statusFilter = ` AND COALESCE(p.is_archived,0) = 0 AND COALESCE(p.status,'draft') = 'draft'`;
    } else {
      statusFilter = `
        AND COALESCE(p.is_archived,0) = 0
        AND COALESCE(p.status,'draft') IN ('draft','active','submitted','pending')
      `;
    }

    /* ----- search ----- */
    let search = '';
    if (q) {
      search = ` AND (
        p.title LIKE ? OR p.topic LIKE ? OR p.description LIKE ? OR p.keywords LIKE ?
      )`;
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }

    /* ----- de-dupe Student-Idea pool (keep latest per cycle) ----- */
    const sql = `
      SELECT *
      FROM (
        SELECT
          p.project_id,
          p.title,
          p.topic,
          p.description,
          p.keywords,
          p.quota,
          p.spots_filled,
          COALESCE(p.status,'draft') AS status,
          p.approval_status,
          COALESCE(p.is_archived,0)   AS is_archived,
          p.is_student_pool,
          p.cycle_id,
          p.updated_at,
          p.created_at,
          ROW_NUMBER() OVER (
            PARTITION BY p.supervisor_id, p.cycle_id, COALESCE(p.is_student_pool,0)
            ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.project_id DESC
          ) AS rn
        FROM projects p
        ${where}
        ${statusFilter}
        ${search}
      ) t
      WHERE (t.is_student_pool IS NULL OR t.is_student_pool = 0 OR t.rn = 1)
      ORDER BY COALESCE(t.updated_at, t.created_at) DESC
    `;

    const [rows] = await db.query(sql, params);
    res.json(rows || []);
  } catch (e) {
    console.error('getMyProjects error:', e);
    res.status(500).json({ message: 'Failed to fetch projects' });
  }
};

/* ---------------- Existing Handlers ---------------- */

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
    if (conn) {
      try { await conn.rollback(); } catch (_) {}
      try { conn.release(); } catch (_) {}
    }
  }
};
