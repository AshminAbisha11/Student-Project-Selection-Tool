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