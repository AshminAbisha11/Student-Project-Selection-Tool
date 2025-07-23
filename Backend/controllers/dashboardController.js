const db = require('../config/db');

// Student Dashboard Controller
exports.getStudentDashboard = async (req, res) => {
  try {
    const studentId = req.user?.user_id;
    console.log("Student ID from token:", studentId);
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // 1. Get Student Name
    const [studentResult] = await db.query(
      'SELECT name FROM students WHERE id = ?',
      [studentId]
    );
    const studentName = studentResult[0]?.name || 'Student';

    // 2. Get Number of Preferences Submitted
    const [preferencesResult] = await db.query(
      'SELECT COUNT(*) AS count FROM preferences WHERE student_id = ?',
      [studentId]
    );
    const preferencesCount = preferencesResult[0].count;

    // 3. Get Number of Proposals Sent
    const [proposalsResult] = await db.query(
      'SELECT COUNT(*) AS count FROM proposals WHERE student_id = ?',
      [studentId]
    );
    const proposalsCount = proposalsResult[0].count;

    // 4. Get Latest Application Status (if any)
    const [applicationResult] = await db.query(
      'SELECT status FROM applications WHERE student_id = ? ORDER BY updated_at DESC LIMIT 1',
      [studentId]
    );
    const applicationStatus = applicationResult[0]?.status || 'Not Applied';

    // Final response
    res.status(200).json({
      name: studentName,
      stats: {
        preferencesSubmitted: preferencesCount,
        proposalsSent: proposalsCount,
        applicationStatus: applicationStatus
      }
    });

  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ message: "Something went wrong fetching dashboard data." });
  }
};
