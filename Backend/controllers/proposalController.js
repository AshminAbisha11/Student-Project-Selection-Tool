const db = require('../config/db');
const path = require('path');
const fs = require('fs');

// Submit a new proposal
exports.submitProposal = async (req, res) => {
  const { student_id, supervisor_id, title, description } = req.body;
  const file = req.file;

  if (!student_id || !supervisor_id || !title || !description) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    const submitted_at = new Date();
    const file_path = file ? file.filename : null;

    const [result] = await db.query(
      `INSERT INTO proposals (student_id, supervisor_id, title, description, submitted_at, file_path)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [student_id, supervisor_id, title, description, submitted_at, file_path]
    );

    res.status(201).json({ message: 'Proposal submitted successfully' });
  } catch (err) {
    console.error('Error submitting proposal:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get proposals submitted by a student
exports.getProposalsByStudent = async (req, res) => {
  const studentId = req.params.studentId;

  try {
    const [rows] = await db.query(
      `SELECT id AS proposal_id, title, description, file_path
       FROM proposals
       WHERE student_id = ?`,
      [studentId]
    );

    res.json(rows);
  } catch (err) {
    console.error('Error retrieving proposals:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

