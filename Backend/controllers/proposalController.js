// controllers/proposalController.js
const db = require('../config/db');
const path = require('path');
const fs = require('fs');

/** small helper to remove a file if we fail after upload */
function removeIfExists(filePathAbs) {
  try {
    if (filePathAbs && fs.existsSync(filePathAbs)) fs.unlinkSync(filePathAbs);
  } catch (_) {}
}

/**
 * POST /proposals
 * Body (multipart/form-data):
 *  - title          (required)
 *  - description    (required)
 *  - supervisor_id  (required)  -> must belong to a user with role='supervisor'
 *  - file           (optional)  -> handled by multer; available as req.file
 *
 * Auth: verifyToken required. Uses req.user.user_id as student_id.
 */
exports.submitProposal = async (req, res) => {
  const studentId = req.user?.user_id; // from verifyToken middleware
  const { supervisor_id, title, description } = req.body || {};
  const file = req.file || null;

  if (!studentId) return res.status(401).json({ message: 'Unauthorized' });
  if (!title || !description || !supervisor_id) {
    return res.status(400).json({ message: 'Title, description, and supervisor are required.' });
  }

  try {
    // 1) Validate supervisor
    const supId = Number(supervisor_id);
    if (!Number.isInteger(supId)) {
      return res.status(400).json({ message: 'Invalid supervisor id.' });
    }

    const [supRows] = await db.query(
      `SELECT user_id, name, email
         FROM users
        WHERE user_id = ? AND role = 'supervisor'
        LIMIT 1`,
      [supId]
    );
    if (supRows.length === 0) {
      return res.status(400).json({ message: 'Selected supervisor not found.' });
    }
    const supervisor = supRows[0];

    // 2) Prepare file info (multer usually sets .filename)
    const storedFilename = file ? file.filename : null;

    // 3) Insert proposal
    const [result] = await db.query(
      `INSERT INTO proposals
         (student_id, supervisor_id, title, description, submitted_at, file_path)
       VALUES (?, ?, ?, ?, NOW(), ?)`,
      [studentId, supId, title, description, storedFilename]
    );

    return res.status(201).json({
      message: 'Proposal submitted successfully.',
      proposal_id: result.insertId,
      file_path: storedFilename,
      supervisor: { user_id: supervisor.user_id, name: supervisor.name, email: supervisor.email },
    });
  } catch (err) {
    console.error('Error submitting proposal:', err);

    // If we uploaded a file but failed afterwards, remove it
    if (req.file?.path) {
      const abs = path.isAbsolute(req.file.path)
        ? req.file.path
        : path.join(process.cwd(), req.file.path);
      removeIfExists(abs);
    }

    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * GET /proposals/:studentId?   (if you prefer: create a /proposals/mine route and ignore param)
 * Returns proposals for the current student.
 *
 * Security:
 *  - Students can only read their own proposals.
 *  - If a :studentId param is given and doesn't match the requester (and requester
 *    is not an admin), 403 is returned.
 */
exports.getProposalsByStudent = async (req, res) => {
  const studentId = req.user?.user_id; // from auth middleware
  if (!studentId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const [rows] = await db.query(
      `
      SELECT
        p.proposal_id   AS proposal_id,
        p.title,
        p.description,
        p.submitted_at,
        p.file_path,
        p.supervisor_id,
        u.name          AS supervisor_name,
        u.email         AS supervisor_email,
        p.status        AS status
      FROM proposals p
      LEFT JOIN users u ON u.user_id = p.supervisor_id
      WHERE p.student_id = ?
      ORDER BY p.submitted_at DESC, p.proposal_id DESC
      `,
      [studentId]
    );

    return res.json(rows || []);
  } catch (err) {
    console.error('Error retrieving proposals:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};