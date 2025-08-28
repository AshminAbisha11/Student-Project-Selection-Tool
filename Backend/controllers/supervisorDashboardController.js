// controllers/supervisorController.js
const db = require('../config/db');

/**
 * GET /supervisor/overview
 * Requires: authMiddleware (req.user with user_id + role)
 */
exports.getOverview = async (req, res) => {
  try {
    const supervisorId = req.user?.user_id;
    if (!supervisorId) return res.status(401).json({ message: 'Unauthorized' });

    // 1) Projects supervised (exclude archived)
    // Supports either an `is_archived` boolean OR a string `status='archived'`
    const projSql = `
      SELECT COUNT(*) AS projects
      FROM projects
      WHERE supervisor_id = ?
        AND (
          (is_archived IS NULL OR is_archived = 0)
          AND (status IS NULL OR status <> 'archived')
        )
    `;
    const [[projRow]] = await db.query(projSql, [supervisorId]);

    // 2) Pending proposals (adjust statuses to your schema)
    const propSql = `
      SELECT COUNT(*) AS pendingProposals
      FROM proposals
      WHERE supervisor_id = ?
        AND (status IS NULL OR status IN ('pending','submitted','under_review'))
    `;
    const [[propRow]] = await db.query(propSql, [supervisorId]);

    // 3) Allocated students (distinct)
    let allocatedStudents = 0;
    try {
      const allocSql = `
        SELECT COUNT(DISTINCT student_id) AS allocatedStudents
        FROM allocations
        WHERE supervisor_id = ?
          AND status IN ('allocated','approved','accepted')
      `;
      const [[allocRow]] = await db.query(allocSql, [supervisorId]);
      allocatedStudents = Number(allocRow?.allocatedStudents || 0);
    } catch (err) {
      if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
    }

    res.json({
      projects: Number(projRow?.projects || 0),
      pendingProposals: Number(propRow?.pendingProposals || 0),
      allocatedStudents
    });
  } catch (err) {
    console.error('Supervisor overview error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};
