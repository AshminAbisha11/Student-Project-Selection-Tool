// controllers/dashboardController.js
const db = require('../config/db');

/* -------- Helpers: find active cycle -------- */
async function getActiveCycleId() {
  const [byStatus] = await db.query(
    `SELECT cycle_id
       FROM allocation_cycles
      WHERE status = 'open'
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

exports.getStudentDashboard = async (req, res) => {
  try {
    const studentId = req.user?.user_id;
    console.log('Student ID from token:', studentId);
    if (!studentId) return res.status(401).json({ message: 'Unauthorized' });

    const raw = req.query?.cycle_id;
    let cycleId = null;
    let cycleScope = 'param';
    if (raw != null && String(raw).trim() !== '') {
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) {
        return res.status(400).json({ message: 'Invalid cycle_id' });
      }
      cycleId = n;
    } else {
      cycleId = await getActiveCycleId();
      cycleScope = cycleId ? 'active' : 'all'; 
    }

    const cycleFilter = cycleId ? 'AND cycle_id = ?' : '';
    const params = cycleId ? [studentId, cycleId] : [studentId];

    // 1) Student name (users table, role=student)
    // If you kept a compatibility VIEW `students`, you can swap this back to that.
    const [[userRow]] = await db.query(
      `SELECT name FROM users WHERE user_id = ? AND role = 'student'`,
      [studentId]
    );
    const studentName = userRow?.name || 'Student';

    // 2) Preferred projects count
    const [[prefRow]] = await db.query(
      `SELECT COUNT(*) AS count
         FROM preferences
        WHERE student_id = ?
          ${cycleFilter}`,
      params
    );
    const preferencesCount = Number(prefRow?.count || 0);

    // 3) Proposals sent count
    const [[propRow]] = await db.query(
      `SELECT COUNT(*) AS count
         FROM proposals
        WHERE student_id = ?
          ${cycleFilter}`,
      params
    );
    const proposalsCount = Number(propRow?.count || 0);

    // 4) Latest application status (optional table)
    let applicationStatus = 'Not Applied';
    try {
      const appParams = cycleId ? [studentId, cycleId] : [studentId];
      const [[appRow]] = await db.query(
        `SELECT status
           FROM applications
          WHERE student_id = ?
            ${cycleId ? 'AND cycle_id = ?' : ''}
          ORDER BY updated_at DESC
          LIMIT 1`,
        appParams
      );
      if (appRow?.status) applicationStatus = appRow.status;
    } catch (e) {
      if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    // Final response
    res.status(200).json({
      name: studentName,
      stats: {
        preferencesSubmitted: preferencesCount,
        proposalsSent: proposalsCount,
        applicationStatus
      },
      cycle: {
        cycle_id: cycleId,         
        scope: cycleScope         
      }
    });
  } catch (error) {
    console.error('getStudentDashboard error:', error);
    res.status(500).json({ message: 'Something went wrong fetching dashboard data.' });
  }
};
