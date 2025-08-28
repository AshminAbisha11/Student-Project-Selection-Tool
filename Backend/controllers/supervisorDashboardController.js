// controllers/supervisorController.js
const db = require('../config/db');

async function columnExists(table, column) {
  const [rows] = await db.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

/**
 * GET /supervisor/overview
 * Requires: authMiddleware (req.user with user_id + role)
 */
exports.getOverview = async (req, res) => {
  try {
    const supervisorId = req.user?.user_id;
    if (!supervisorId) return res.status(401).json({ message: 'Unauthorized' });

    // ---- Build project filters based on actual schema ----
    const hasIsArchived   = await columnExists('projects', 'is_archived');
    const hasStatus       = await columnExists('projects', 'status');
    const hasApproval     = await columnExists('projects', 'approval_status');
    const hasPoolFlag     = await columnExists('projects', 'is_student_pool');

    const projWhere = ['supervisor_id = ?'];
    if (hasIsArchived) projWhere.push('(is_archived IS NULL OR is_archived = 0)');
    if (hasStatus)     projWhere.push("(status IS NULL OR status <> 'archived')");
    if (hasApproval)   projWhere.push("(approval_status IS NULL OR LOWER(approval_status) IN ('approved','open','active'))");
    if (hasPoolFlag)   projWhere.push('COALESCE(is_student_pool,0) = 0'); // don’t count pool projects (optional)

    const [[projRow]] = await db.query(
      `SELECT COUNT(*) AS projects FROM projects WHERE ${projWhere.join(' AND ')}`,
      [supervisorId]
    );

    // ---- Proposals (adjust statuses if your schema differs) ----
    const [[propRow]] = await db.query(
      `SELECT COUNT(*) AS pendingProposals
         FROM proposals
        WHERE supervisor_id = ?
          AND (status IS NULL OR status IN ('pending','submitted','under_review'))`,
      [supervisorId]
    );

    // ---- Allocations (gracefully optional) ----
    let allocatedStudents = 0;
    try {
      const [[allocRow]] = await db.query(
        `SELECT COUNT(DISTINCT student_id) AS allocatedStudents
           FROM allocations
          WHERE supervisor_id = ?
            AND status IN ('allocated','approved','accepted')`,
        [supervisorId]
      );
      allocatedStudents = Number(allocRow?.allocatedStudents || 0);
    } catch (err) {
      // If allocations table doesn't exist, ignore; otherwise bubble up
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
