// controllers/supervisorController.js
const db = require('../config/db');

/**
 * GET /supervisor/overview
 * Requires: authMiddleware (req.user with user_id + role)
 */
exports.getOverview = async (req, res) => {
  try {
    const supervisorId = req.user.user_id;

    // 1) Projects supervised (exclude archived)
    const [[projRow]] = await db.query(
      `
      SELECT COUNT(*) AS projects
      FROM projects
      WHERE supervisor_id = ?
        AND (status IS NULL OR status <> 'archived')
      `,
      [supervisorId]
    );

    // 2) Pending proposals (if you don't have a 'status' column yet,
    //    this will count all proposals for that supervisor)
    const [[propRow]] = await db.query(
      `
      SELECT COUNT(*) AS pendingProposals
      FROM proposals
      WHERE supervisor_id = ?
        AND (status IS NULL OR status IN ('pending','submitted'))
      `,
      [supervisorId]
    );

    // 3) Allocated students (distinct)
    //    Adjust statuses to match your allocations table values
    //    If you don't have an 'allocations' table yet, create it or change this query.
    let allocatedStudents = 0;
    try {
      const [[allocRow]] = await db.query(
        `
        SELECT COUNT(DISTINCT student_id) AS allocatedStudents
        FROM allocations
        WHERE supervisor_id = ?
          AND status IN ('allocated','approved','accepted')
        `,
        [supervisorId]
      );
      allocatedStudents = Number(allocRow?.allocatedStudents || 0);
    } catch (err) {
      // If the allocations table doesn't exist yet, just default to 0
      if (err.code !== 'ER_NO_SUCH_TABLE') {
        throw err;
      }
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
