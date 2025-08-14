// controllers/projectController.js
const db = require('../config/db');
const stringSimilarity = require('string-similarity');

// helper for UI quota badges
const formatQuota = (remaining) =>
  remaining > 0 ? `${remaining} slot${remaining > 1 ? 's' : ''} left` : 'Full';

const parseBool = (v, def = false) => {
  if (v === undefined || v === null) return def;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
};

/* ========================================================
 * PUBLIC / BROWSE  (archived hidden by default)
 * ====================================================== */

// 1) Get all projects (non-archived)
exports.getAllProjects = async (_req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        p.project_id, p.title, p.description, p.topic, p.keywords,
        p.supervisor_id, p.supervisor_name,
        p.quota, p.spots_filled,
        GREATEST(p.quota - p.spots_filled, 0) AS quota_remaining,
        p.approval_status, p.is_student_proposal,
        p.created_at, p.updated_at
      FROM projects p
      WHERE p.is_archived = 0
      ORDER BY p.created_at DESC, p.project_id DESC
    `);
    res.status(200).json(rows ?? []);
  } catch (error) {
    console.error('Error fetching all projects:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 2) Full project details by ID (public view; hides archived)
exports.getProjectDetails = async (req, res) => {
  const { projectId } = req.params;
  const id = Number(projectId);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'Invalid projectId' });
  }

  try {
    const [rows] = await db.execute(`
      SELECT 
        p.project_id, p.title, p.supervisor_name, p.topic, p.keywords,
        p.quota, p.spots_filled, GREATEST(p.quota - p.spots_filled, 0) AS quota_remaining,
        p.approval_status, p.is_student_proposal, p.created_at, p.updated_at,
        d.full_description, d.prerequisites
      FROM projects p
      LEFT JOIN project_details d ON p.project_id = d.project_id
      WHERE p.project_id = ? AND p.is_archived = 0
    `, [id]);

    if (!rows.length) return res.status(404).json({ message: 'Project not found' });
    res.status(200).json(rows[0]);
  } catch (error) {
    console.error('Error fetching project details:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 3) Filter by supervisor (non-archived)
exports.filterBySupervisor = async (req, res) => {
  const { supervisor } = req.params;
  try {
    const [rows] = await db.execute(`
      SELECT
        p.*, GREATEST(p.quota - p.spots_filled, 0) AS quota_remaining
      FROM projects p
      WHERE p.supervisor_name = ? AND p.is_archived = 0
      ORDER BY p.created_at DESC, p.project_id DESC
    `, [supervisor]);

    if (!rows.length) {
      return res.status(404).json({ message: `No projects found for supervisor: ${supervisor}` });
    }
    res.status(200).json({ projects: rows });
  } catch (error) {
    console.error('Error filtering by supervisor:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 4) Filter by topic (non-archived)
exports.filterByTopic = async (req, res) => {
  const { topic } = req.params;
  try {
    const [rows] = await db.execute(`
      SELECT
        p.*, GREATEST(p.quota - p.spots_filled, 0) AS quota_remaining
      FROM projects p
      WHERE p.topic = ? AND p.is_archived = 0
      ORDER BY p.created_at DESC, p.project_id DESC
    `, [topic]);

    if (!rows.length) {
      return res.status(404).json({ message: `No projects found for topic: ${topic}` });
    }
    res.status(200).json({ projects: rows });
  } catch (error) {
    console.error('Error filtering by topic:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 5) Filter by keyword in keywords field (non-archived)
exports.filterByKeyword = async (req, res) => {
  const { keyword } = req.query;
  try {
    const [rows] = await db.execute(`
      SELECT
        p.*, GREATEST(p.quota - p.spots_filled, 0) AS quota_remaining
      FROM projects p
      WHERE p.keywords LIKE ? AND p.is_archived = 0
      ORDER BY p.created_at DESC, p.project_id DESC
    `, [`%${keyword}%`]);

    if (!rows.length) {
      return res.status(404).json({ message: `No projects found for keyword: ${keyword}` });
    }
    res.status(200).json({ projects: rows });
  } catch (error) {
    console.error('Error filtering by keyword:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 6) Multi-filter (non-archived)
exports.multiFilteredProjects = async (req, res) => {
  const { supervisor, topic, keyword } = req.query;
  const clauses = ['p.is_archived = 0'];
  const params = [];

  if (supervisor) { clauses.push('p.supervisor_name = ?'); params.push(supervisor); }
  if (topic) { clauses.push('p.topic = ?'); params.push(topic); }
  if (keyword) { clauses.push('p.keywords LIKE ?'); params.push(`%${keyword}%`); }

  try {
    const [rows] = await db.execute(`
      SELECT
        p.*, GREATEST(p.quota - p.spots_filled, 0) AS quota_remaining
      FROM projects p
      WHERE ${clauses.join(' AND ')}
      ORDER BY p.created_at DESC, p.project_id DESC
    `, params);

    res.status(200).json(rows ?? []);
  } catch (error) {
    console.error('Error in multi-filter:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 7) Search by title/description (non-archived)
exports.searchProjects = async (req, res) => {
  const { query: searchTerm } = req.query;
  if (!searchTerm) {
    return res.status(400).json({ message: 'Search term required' });
  }
  try {
    const [rows] = await db.execute(`
      SELECT
        p.*, GREATEST(p.quota - p.spots_filled, 0) AS quota_remaining
      FROM projects p
      WHERE (p.title LIKE ? OR p.description LIKE ?)
        AND p.is_archived = 0
      ORDER BY p.created_at DESC, p.project_id DESC
    `, [`%${searchTerm}%`, `%${searchTerm}%`]);

    res.status(200).json(rows ?? []);
  } catch (error) {
    console.error('Error searching projects:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/* ========================================================
 * SUPERVISOR AREA
 * ====================================================== */

// My projects (owned by logged-in supervisor)
// ?archived=1 -> archived only; ?archived=0 -> active only (default); ?archived=all -> both
exports.getMyProjects = async (req, res) => {
  const supervisorId = req.user?.user_id;
  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized' });

  const archivedParam = (req.query.archived || '').toString().toLowerCase();
  let where = 'WHERE p.supervisor_id = ?';
  const params = [supervisorId];

  if (archivedParam === 'all') {
    // no filter
  } else {
    const archived = parseBool(archivedParam, false) ? 1 : 0;
    where += ' AND p.is_archived = ?';
    params.push(archived);
  }

  try {
    const [rows] = await db.query(
      `
      SELECT 
        p.project_id, p.title, p.description, p.topic, p.keywords,
        p.quota, p.spots_filled,
        GREATEST(p.quota - p.spots_filled, 0) AS quota_remaining,
        p.approval_status, p.is_student_proposal,
        CAST(p.is_archived AS UNSIGNED) AS is_archived,
        p.archived_at, p.created_at, p.updated_at,
        COALESCE(a.alloc_count, 0) AS allocated_count
      FROM projects p
      LEFT JOIN (
        SELECT project_id, COUNT(*) AS alloc_count
        FROM allocations
        GROUP BY project_id
      ) a ON a.project_id = p.project_id
      ${where}
      ORDER BY p.created_at DESC, p.project_id DESC
      `,
      params
    );

    res.json(rows ?? []);
  } catch (err) {
    console.error('getMyProjects error:', err);
    res.status(500).json({ message: 'Database error' });
  }
};

// === Fetch a single supervisor-owned project (with details) ===
exports.getMyProjectById = async (req, res) => {
  const supervisorId = req.user?.user_id;
  const { projectId } = req.params;
  const id = Number(projectId);
  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized' });
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid projectId' });

  try {
    const [[own]] = await db.query(
      `SELECT project_id FROM projects WHERE project_id = ? AND supervisor_id = ?`,
      [id, supervisorId]
    );
    if (!own) return res.status(404).json({ message: 'Project not found or not yours' });

    const [[row]] = await db.query(`
      SELECT 
        p.project_id, p.title, p.description, p.topic, p.keywords, p.quota,
        p.approval_status, p.is_student_proposal, p.is_archived,
        p.created_at, p.updated_at,
        d.full_description, d.prerequisites
      FROM projects p
      LEFT JOIN project_details d ON d.project_id = p.project_id
      WHERE p.project_id = ?`,
      [id]
    );

    return res.json(row || null);
  } catch (err) {
    console.error('getMyProjectById error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// === Update a project (main fields + details) ===
exports.updateMyProject = async (req, res) => {
  const supervisorId = req.user?.user_id;
  const { projectId } = req.params;
  const id = Number(projectId);
  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized' });
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid projectId' });

  const {
    title,
    description,
    topic = null,
    keywords = null,
    quota,
    full_description = null,
    prerequisites = null,
  } = req.body || {};

  const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
  if (!nonEmpty(title) || !nonEmpty(description)) {
    return res.status(400).json({ message: 'Title and description are required.' });
  }
  const q = Number(quota);
  if (!Number.isInteger(q) || q < 1) {
    return res.status(400).json({ message: 'Quota must be an integer ≥ 1.' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[own]] = await conn.query(
      `SELECT project_id FROM projects WHERE project_id = ? AND supervisor_id = ?`,
      [id, supervisorId]
    );
    if (!own) {
      await conn.rollback();
      return res.status(404).json({ message: 'Project not found or not yours' });
    }

    // update main table
    await conn.query(
      `UPDATE projects
       SET title = ?, description = ?, topic = ?, keywords = ?, quota = ?, updated_at = NOW()
       WHERE project_id = ?`,
      [
        String(title).trim(),
        String(description).trim(),
        topic ? String(topic).trim() : null,
        keywords ? String(keywords).trim() : null,
        q,
        id
      ]
    );

    // upsert project_details
    await conn.query(
      `INSERT INTO project_details (project_id, full_description, prerequisites)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         full_description = VALUES(full_description),
         prerequisites    = VALUES(prerequisites)`,
      [
        id,
        full_description ? String(full_description).trim() : null,
        prerequisites ? String(prerequisites).trim() : null,
      ]
    );

    await conn.commit();

    const [[updated]] = await conn.query(
      `SELECT 
        p.project_id, p.title, p.description, p.topic, p.keywords, p.quota,
        p.approval_status, p.is_student_proposal, p.is_archived,
        p.created_at, p.updated_at,
        d.full_description, d.prerequisites
       FROM projects p
       LEFT JOIN project_details d ON d.project_id = p.project_id
       WHERE p.project_id = ?`,
      [id]
    );

    return res.json({ message: 'Project updated.', project: updated });
  } catch (err) {
    await conn.rollback();
    console.error('updateMyProject error:', err);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
};

/* ========================================================
 * CREATE
 * ====================================================== */
exports.createProject = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'supervisor') {
      return res.status(403).json({ message: 'Only supervisors can create projects.' });
    }

    const {
      title,
      description,
      topic = null,
      keywords = null,
      quota,
      full_description = null,
      prerequisites = null,
    } = req.body || {};

    const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
    if (!nonEmpty(title) || !nonEmpty(description)) {
      return res.status(400).json({ message: 'Title and description are required.' });
    }

    const q = Number(quota);
    if (!Number.isInteger(q) || q < 1) {
      return res.status(400).json({ message: 'Quota must be an integer ≥ 1.' });
    }

    const supervisor_id = req.user.user_id;
    const supervisor_name = req.user.name || '';

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const insertProjectSql = `
        INSERT INTO projects
          (title, description, supervisor_name, topic, keywords,
           quota, spots_filled, approval_status, supervisor_id, is_student_proposal, is_archived)
        VALUES (?, ?, ?, ?, ?, ?, 0, 'approved', ?, 0, 0)
      `;
      const [result] = await conn.query(insertProjectSql, [
        title.trim(),
        description.trim(),
        supervisor_name,
        topic ? String(topic).trim() : null,
        keywords ? String(keywords).trim() : null,
        Number(quota),
        supervisor_id,
      ]);

      const project_id = result.insertId;

      const insertDetailsSql = `
        INSERT INTO project_details (project_id, full_description, prerequisites)
        VALUES (?, ?, ?)
      `;
      await conn.query(insertDetailsSql, [
        project_id,
        full_description ? String(full_description).trim() : null,
        prerequisites ? String(prerequisites).trim() : null,
      ]);

      await conn.commit();

      const [[project]] = await conn.query(
        `SELECT p.project_id, p.title, p.description, p.topic, p.keywords,
                p.quota, p.spots_filled, p.approval_status, p.created_at, p.updated_at,
                p.supervisor_id, p.supervisor_name, p.is_student_proposal, p.is_archived
         FROM projects p
         WHERE p.project_id = ?`,
        [project_id]
      );

      return res.status(201).json({ message: 'Project created.', project });
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Create project error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/* ========================================================
 * ARCHIVE / UNARCHIVE
 * ====================================================== */
exports.archiveProject = async (req, res) => {
  const supervisorId = req.user?.user_id;
  const { projectId } = req.params;
  if (!projectId) return res.status(400).json({ message: 'projectId is required' });

  try {
    const [[proj]] = await db.query(
      `SELECT project_id FROM projects WHERE project_id = ? AND supervisor_id = ?`,
      [projectId, supervisorId]
    );
    if (!proj) return res.status(404).json({ message: 'Project not found or not yours' });

    const [[alloc]] = await db.query(
      `SELECT COUNT(*) AS c FROM allocations WHERE project_id = ?`,
      [projectId]
    );
    if ((alloc?.c || 0) > 0) {
      return res.status(409).json({ message: 'Cannot archive: project has allocated students' });
    }

    const [upd] = await db.query(
      `UPDATE projects SET is_archived = 1, archived_at = NOW() WHERE project_id = ?`,
      [projectId]
    );
    if (!upd.affectedRows) return res.status(500).json({ message: 'Archive failed' });

    return res.json({ message: 'Project archived' });
  } catch (err) {
    console.error('archiveProject error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.unarchiveProject = async (req, res) => {
  const supervisorId = req.user?.user_id;
  const { projectId } = req.params;
  if (!projectId) return res.status(400).json({ message: 'projectId is required' });

  try {
    const [[proj]] = await db.query(
      `SELECT project_id FROM projects WHERE project_id = ? AND supervisor_id = ?`,
      [projectId, supervisorId]
    );
    if (!proj) return res.status(404).json({ message: 'Project not found or not yours' });

    const [upd] = await db.query(
      `UPDATE projects SET is_archived = 0, archived_at = NULL WHERE project_id = ?`,
      [projectId]
    );
    if (!upd.affectedRows) return res.status(500).json({ message: 'Unarchive failed' });

    return res.json({ message: 'Project restored' });
  } catch (err) {
    console.error('unarchiveProject error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};
