const db = require('../config/db');

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

exports.getReceivedProposals = async (req, res) => {
  try {
    const supervisorId = req.user?.user_id;
    if (!supervisorId) return res.status(401).json({ message: 'Unauthorized' });

    const [rows] = await db.query(
      `
      SELECT 
        p.proposal_id,
        p.project_id,
        pr.title AS project_title,          -- may be NULL if project_id is NULL
        u.user_id AS student_id,
        u.name     AS student_name,
        u.email    AS student_email,
        p.title    AS proposal_title,
        p.description AS message,
        p.status,
        p.submitted_at AS created_at,
        p.file_path,
        CASE WHEN p.project_id IS NULL THEN 'student_proposal' ELSE 'supervisor_project' END AS source_type,
        COALESCE(pr.title, p.title) AS display_title  -- <-- use this in UI
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
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch proposals' });
  }
};

// add this below your other exports
exports.decideProposal = async (req, res) => {
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

    // Load proposal
    const [[p]] = await db.query(
      `SELECT proposal_id, student_id, supervisor_id, project_id, cycle_id
         FROM proposals
        WHERE proposal_id=? AND supervisor_id=?`,
      [proposalId, supervisorId]
    );
    if (!p) return res.status(404).json({ message: 'Not found' });

    // If accepting a student idea (project_id is NULL), allocate into pool project
    if (normalized === 'accepted' && p.project_id == null) {
      const [[pool]] = await db.query(
        `
        SELECT pool.project_id, pool.quota,
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
           AND (pool.approval_status IS NULL OR LOWER(pool.approval_status) IN ('open','approved','active'))
         LIMIT 1
        `,
        [p.cycle_id, supervisorId]
      );

      if (!pool || (pool.seats_left ?? 0) <= 0) {
        return res.status(409).json({ message: 'No seats available in student-idea pool.' });
      }

      // Insert allocation if not already present
      await db.query(
        `INSERT IGNORE INTO allocations
           (cycle_id, project_id, student_id, supervisor_id, proposal_id, status, allocated_at)
         VALUES (?, ?, ?, ?, ?, 'allocated', NOW())`,
        [p.cycle_id, pool.project_id, p.student_id, supervisorId, p.proposal_id]
      );

      // Update pool project fill count
      await db.query(
        `UPDATE projects
            SET spots_filled = LEAST(spots_filled + 1, quota)
          WHERE project_id = ?`,
        [pool.project_id]
      );
    }

    // Update proposal status and reason
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
  }
};
