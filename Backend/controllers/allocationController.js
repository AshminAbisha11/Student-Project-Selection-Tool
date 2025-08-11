// src/controllers/allocationController.js
const db = require('../config/db'); // mysql2/promise pool

// Allocate a student to a project (supervisor from JWT)
exports.allocate = async (req, res) => {
  const supervisorId = req.user.user_id;        // from verifyToken
  const { project_id, student_id } = req.body;

  if (!project_id || !student_id) {
    return res.status(400).json({ message: 'project_id and student_id are required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Lock the project row to prevent race conditions
    const [rows] = await conn.query(
      'SELECT project_id, supervisor_id, quota, spots_filled FROM projects WHERE project_id = ? FOR UPDATE',
      [project_id]
    );
    if (!rows.length) throw new Error('Project not found');

    const project = rows[0];
    if (project.supervisor_id !== supervisorId) {
      throw new Error('Not authorized to allocate for this project');
    }
    if (project.spots_filled >= project.quota) {
      throw new Error('Project quota is full');
    }

    // Try to reserve a spot atomically (defensive)
    const [upd] = await conn.query(
      'UPDATE projects SET spots_filled = spots_filled + 1 WHERE project_id = ? AND spots_filled < quota',
      [project_id]
    );
    if (upd.affectedRows === 0) {
      throw new Error('Project quota is full');
    }

    // Insert allocation (uniq (project_id, student_id) prevents duplicates)
    await conn.query(
      `INSERT INTO allocations (project_id, student_id, supervisor_id)
       VALUES (?, ?, ?)`,
      [project_id, student_id, supervisorId]
    );

    await conn.commit();
    return res.status(201).json({ message: 'Student allocated successfully' });
  } catch (err) {
    await conn.rollback();

    // handle duplicate allocation nicely
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Student already allocated to this project' });
    }
    return res.status(400).json({ message: err.message || 'Allocation failed' });
  } finally {
    conn.release();
  }
};

// Deallocate a student from a project
exports.deallocate = async (req, res) => {
  const supervisorId = req.user.user_id;
  const { allocation_id } = req.params;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Find allocation and lock project
    const [[alloc]] = await conn.query(
      'SELECT allocation_id, project_id, student_id, supervisor_id FROM allocations WHERE allocation_id = ?',
      [allocation_id]
    );
    if (!alloc) throw new Error('Allocation not found');
    if (alloc.supervisor_id !== supervisorId) throw new Error('Not authorized');

    await conn.query('DELETE FROM allocations WHERE allocation_id = ?', [allocation_id]);

    await conn.query(
      'UPDATE projects SET spots_filled = GREATEST(spots_filled - 1, 0) WHERE project_id = ?',
      [alloc.project_id]
    );

    await conn.commit();
    return res.json({ message: 'Allocation removed' });
  } catch (err) {
    await conn.rollback();
    return res.status(400).json({ message: err.message || 'Deallocation failed' });
  } finally {
    conn.release();
  }
};
