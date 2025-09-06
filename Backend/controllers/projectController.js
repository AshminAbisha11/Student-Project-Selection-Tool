// controllers/projectController.js
const db = require('../config/db');

/* -----------------------------
  Helpers
------------------------------ */
const STUDENT_IDEA_TOPIC_NAME = 'Student Proposal Ideas';

const normalize = (s) => (s ?? '').toString().trim().toLowerCase();
const isStudentIdeaTopic = (topic) =>
  normalize(topic) === normalize(STUDENT_IDEA_TOPIC_NAME);

async function getMostRecentCycleId() {
  const [r] = await db.query(`
    SELECT cycle_id
    FROM allocation_cycles
    ORDER BY submission_open_at DESC, cycle_id DESC
    LIMIT 1
  `);
  return r.length ? r[0].cycle_id : null;
}

// Strictly "open" by status (what students should use)
async function getOpenCycleId() {
  const [r] = await db.query(`
    SELECT cycle_id
    FROM allocation_cycles
    WHERE status='open'
    ORDER BY submission_open_at DESC
    LIMIT 1
  `);
  return r.length ? r[0].cycle_id : null;
}

// "Active" is a bit looser (status open or current datetime in window)
async function getActiveCycleId() {
  const [byStatus] = await db.query(`
    SELECT cycle_id FROM allocation_cycles
    WHERE status='open'
    ORDER BY submission_open_at DESC
    LIMIT 1
  `);
  if (byStatus.length) return byStatus[0].cycle_id;

  const [byDate] = await db.query(`
    SELECT cycle_id FROM allocation_cycles
    WHERE NOW() BETWEEN submission_open_at AND submission_close_at
    ORDER BY submission_open_at DESC
    LIMIT 1
  `);
  return byDate.length ? byDate[0].cycle_id : null;
}

async function resolveSupervisorCycleFilter(req) {
  const raw = (req.query.cycle ?? req.query.cycle_id ?? '').toString().trim().toLowerCase();
  if (raw === 'all') return { cycleId: null, source: 'all' };      // no cycle filter
  if (/^\d+$/.test(raw)) return { cycleId: Number(raw), source: 'request' };

  // default: prefer open; else most recent
  const open = await getOpenCycleId();
  if (open) return { cycleId: open, source: 'open' };
  const recent = await getMostRecentCycleId();
  return { cycleId: recent, source: 'recent' };
}

const parseBool = (v, def = false) => {
  if (v === undefined || v === null) return def;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
};

/* -------------------------------------------
  Public browse columns/joins
  - projects.supervisor_id -> users.user_id
-------------------------------------------- */
const baseColumns = `
  p.project_id,
  p.title,
  p.description,
  p.topic,
  p.keywords,
  p.quota,
  p.spots_filled,
  GREATEST(p.quota - p.spots_filled, 0) AS quota_remaining,
  p.approval_status,
  p.is_student_proposal,
  p.is_student_pool,
  p.cycle_id,
  p.created_at,
  p.updated_at,
  p.is_archived,

  u.user_id AS supervisor_id,
  COALESCE(u.name, p.supervisor_name)  AS supervisor_name,
  u.email  AS supervisor_email
`;

const baseJoins = `
  LEFT JOIN users u ON u.user_id = p.supervisor_id
`;

/* ========================================================
 * PUBLIC / STUDENT BROWSE (only when a cycle is OPEN)
 * ====================================================== */
exports.listForStudents = async (req, res) => {
  try {
    // strict: only 'open' status counts
    const openCycleId = await getOpenCycleId();
    if (!openCycleId) {
      return res
        .status(409)
        .json({ message: 'Project browsing is not open yet. An allocation cycle must be OPEN.' });
    }

    const {
      supervisor = '',
      topic = '',
      keyword = '',
      limit = '200',
      offset = '0',
    } = req.query;

    // WHERE clauses & params
    const clauses = [
      'p.cycle_id = ?',
      'p.is_archived = 0',
      "LOWER(TRIM(p.approval_status)) = 'approved'",
    ];
    const params = [openCycleId];

    if (supervisor.trim()) {
      clauses.push('LOWER(TRIM(COALESCE(u.name, p.supervisor_name))) LIKE LOWER(TRIM(?))');
      params.push(`%${supervisor}%`);
    }
    if (topic.trim()) {
      clauses.push('LOWER(TRIM(p.topic)) LIKE LOWER(TRIM(?))');
      params.push(`%${topic}%`);
    }
    if (keyword.trim()) {
      const k = `%${keyword}%`;
      clauses.push('(p.keywords LIKE ? OR p.title LIKE ? OR p.description LIKE ?)');
      params.push(k, k, k);
    }

    const lim = Math.min(500, Math.max(1, parseInt(limit, 10) || 200));
    const off = Math.max(0, parseInt(offset, 10) || 0);

    const [rows] = await db.query(
      `
      SELECT ${baseColumns}
      FROM projects p
      ${baseJoins}
      WHERE ${clauses.join(' AND ')}
      ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.project_id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, lim, off]
    );

    res.set('Cache-Control', 'no-store');
    res.json({
      cycle_id: openCycleId,
      count: rows?.length || 0,
      projects: rows || [],
    });
  } catch (error) {
    console.error('listForStudents error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/* ========================================================
 * PUBLIC / SEARCH (admin/dev use; not cycle-gated)
 * ====================================================== */
exports.getAllProjects = async (_req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT ${baseColumns}
      FROM projects p
      ${baseJoins}
      WHERE p.is_archived = 0
      ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.project_id DESC
      `
    );
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ projects: rows ?? [], count: rows?.length ?? 0 });
  } catch (error) {
    console.error('Error fetching all projects:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getProjectDetails = async (req, res) => {
  const id = Number(req.params.projectId);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'Invalid projectId' });
  }

  try {
    const [rows] = await db.execute(
      `
      SELECT
        ${baseColumns},
        d.full_description,
        d.prerequisites
      FROM projects p
      ${baseJoins}
      LEFT JOIN project_details d ON d.project_id = p.project_id
      WHERE p.project_id = ? AND p.is_archived = 0
      `,
      [id]
    );

    if (!rows.length) return res.status(404).json({ message: 'Project not found' });
    res.set('Cache-Control', 'no-store');
    res.status(200).json(rows[0]);
  } catch (error) {
    console.error('Error fetching project details:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.filterBySupervisor = async (req, res) => {
  const { supervisor } = req.params;
  try {
    const [rows] = await db.execute(
      `
      SELECT ${baseColumns}
      FROM projects p
      ${baseJoins}
      WHERE p.is_archived = 0
        AND LOWER(TRIM(COALESCE(u.name, p.supervisor_name))) = LOWER(TRIM(?))
      ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.project_id DESC
      `,
      [supervisor]
    );
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ projects: rows ?? [], count: rows?.length ?? 0 });
  } catch (error) {
    console.error('Error filtering by supervisor:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.filterByTopic = async (req, res) => {
  const { topic } = req.params;
  try {
    const [rows] = await db.execute(
      `
      SELECT ${baseColumns}
      FROM projects p
      ${baseJoins}
      WHERE p.is_archived = 0
        AND LOWER(TRIM(p.topic)) = LOWER(TRIM(?))
      ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.project_id DESC
      `,
      [topic]
    );
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ projects: rows ?? [], count: rows?.length ?? 0 });
  } catch (error) {
    console.error('Error filtering by topic:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.filterByKeyword = async (req, res) => {
  const { keyword } = req.query;
  if (!keyword || !String(keyword).trim()) {
    return res.status(400).json({ message: 'keyword is required' });
  }

  try {
    const [rows] = await db.execute(
      `
      SELECT ${baseColumns}
      FROM projects p
      ${baseJoins}
      WHERE p.is_archived = 0
        AND p.keywords LIKE ?
      ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.project_id DESC
      `,
      [`%${keyword}%`]
    );
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ projects: rows ?? [], count: rows?.length ?? 0 });
  } catch (error) {
    console.error('Error filtering by keyword:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.multiFilteredProjects = async (req, res) => {
  const { supervisor, topic, keyword } = req.query;

  const clauses = ['p.is_archived = 0'];
  const params = [];

  if (supervisor && supervisor.trim()) {
    clauses.push(
      'LOWER(TRIM(COALESCE(u.name, p.supervisor_name))) LIKE LOWER(TRIM(?))'
    );
    params.push(`%${supervisor}%`);
  }
  if (topic && topic.trim()) {
    clauses.push('LOWER(TRIM(p.topic)) LIKE LOWER(TRIM(?))');
    params.push(`%${topic}%`);
  }
  if (keyword && keyword.trim()) {
    const k = `%${keyword}%`;
    clauses.push('(p.keywords LIKE ? OR p.title LIKE ? OR p.description LIKE ?)');
    params.push(k, k, k);
  }

  try {
    const [rows] = await db.execute(
      `
      SELECT ${baseColumns}
      FROM projects p
      ${baseJoins}
      WHERE ${clauses.join(' AND ')}
      ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.project_id DESC
      `,
      params
    );

    res.set('Cache-Control', 'no-store');
    res.status(200).json({ projects: rows ?? [], count: rows?.length ?? 0 });
  } catch (error) {
    console.error('Error in multi-filter:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.searchProjects = async (req, res) => {
  const term = (req.query.query || '').trim();
  if (!term) {
    return res.status(400).json({ message: 'Search term required' });
  }

  try {
    const tokens = term.split(/\s+/).slice(0, 5);
    const fields = [
      'p.title',
      'p.description',
      'COALESCE(u.name, p.supervisor_name)',
      'p.topic',
      'p.keywords',
    ];

    const where = ['p.is_archived = 0'];
    const params = [];

    tokens.forEach((word) => {
      const like = `%${word}%`;
      const ors = fields.map((f) => `${f} LIKE ?`).join(' OR ');
      where.push(`(${ors})`);
      for (let i = 0; i < fields.length; i += 1) params.push(like);
    });

    const sql = `
      SELECT ${baseColumns}
      FROM projects p
      ${baseJoins}
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.project_id DESC
    `;

    const [rows] = await db.execute(sql, params);
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ projects: rows ?? [], count: rows?.length ?? 0 });
  } catch (error) {
    console.error('Error searching projects:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/* ========================================================
 * SUPERVISOR AREA (auth required)
 * ====================================================== */

exports.getMyProjects = async (req, res) => {
  const supervisorId = req.user?.user_id;
  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized' });

  // archived filter: 0|1|all (default 0)
  const archivedParam = (req.query.archived || '').toString().toLowerCase();
  let where = 'WHERE p.supervisor_id = ?';
  const params = [supervisorId];

  if (archivedParam !== 'all') {
    const archived = archivedParam === '1' || archivedParam === 'true';
    where += ' AND p.is_archived = ?';
    params.push(archived ? 1 : 0);
  }

  // cycle filter: open|<id>|all|(fallback to most recent)
  const { cycleId, source } = await resolveSupervisorCycleFilter(req);
  if (cycleId != null) {
    where += ' AND p.cycle_id = ?';
    params.push(cycleId);
  }

  try {
    const [rows] = await db.query(
      `
      SELECT 
        p.project_id, p.title, p.description, p.topic, p.keywords,
        p.quota, p.spots_filled,
        GREATEST(p.quota - p.spots_filled, 0) AS quota_remaining,
        p.approval_status,
        p.is_student_proposal,
        CAST(p.is_archived AS UNSIGNED) AS is_archived,
        p.is_student_pool,
        p.cycle_id,
        p.archived_at, p.created_at, p.updated_at,
        COALESCE(a.alloc_count, 0) AS allocated_count
      FROM projects p
      LEFT JOIN (
        SELECT project_id, COUNT(*) AS alloc_count
        FROM allocations
        GROUP BY project_id
      ) a ON a.project_id = p.project_id
      ${where}
      ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.project_id DESC
      `,
      params
    );

    res.set('Cache-Control', 'no-store');
    res.json({
      meta: {
        cycle_filter: cycleId,      // null means "all"
        cycle_source: source,       // 'open' | 'recent' | 'request' | 'all'
        archived: archivedParam || '0',
        count: rows?.length || 0
      },
      projects: rows ?? []
    });
  } catch (err) {
    console.error('getMyProjects error:', err);
    res.status(500).json({ message: 'Database error' });
  }
};

exports.getMyProjectById = async (req, res) => {
  const supervisorId = req.user?.user_id;
  const { projectId } = req.params;
  const id = Number(projectId);
  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized' });
  if (!Number.isInteger(id) || id <= 0)
    return res.status(400).json({ message: 'Invalid projectId' });

  try {
    const [[own]] = await db.query(
      `SELECT project_id FROM projects WHERE project_id = ? AND supervisor_id = ?`,
      [id, supervisorId]
    );
    if (!own) return res.status(404).json({ message: 'Project not found or not yours' });

    const [[row]] = await db.query(
      `
      SELECT 
        p.project_id, p.title, p.description, p.topic, p.keywords, p.quota,
        p.approval_status, p.is_student_proposal, p.is_archived,
        p.is_student_pool, p.cycle_id,
        p.created_at, p.updated_at,
        d.full_description, d.prerequisites
      FROM projects p
      LEFT JOIN project_details d ON d.project_id = p.project_id
      WHERE p.project_id = ?
      `,
      [id]
    );

    res.set('Cache-Control', 'no-store');
    return res.json(row || null);
  } catch (err) {
    console.error('getMyProjectById error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.updateMyProject = async (req, res) => {
  const supervisorId = req.user?.user_id;
  const { projectId } = req.params;
  const id = Number(projectId);
  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized' });
  if (!Number.isInteger(id) || id <= 0)
    return res.status(400).json({ message: 'Invalid projectId' });

  const {
    title,
    description,
    topic = null,
    keywords = null,
    quota,
    full_description = null,
    prerequisites = null,
    cycle_id: cycleIdFromBody = null, // allow overriding cycle
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

    // Ownership + current cycle
    const [[own]] = await conn.query(
      `SELECT project_id, cycle_id FROM projects WHERE project_id = ? AND supervisor_id = ?`,
      [id, supervisorId]
    );
    if (!own) {
      await conn.rollback();
      return res.status(404).json({ message: 'Project not found or not yours' });
    }

    const studentPool = isStudentIdeaTopic(topic);
    let cycleId;
    if (cycleIdFromBody !== null && cycleIdFromBody !== undefined) {
      cycleId = Number(cycleIdFromBody);
      if (!Number.isInteger(cycleId) || cycleId <= 0) {
        await conn.rollback();
        return res.status(400).json({ message: 'Invalid cycle_id' });
      }
    } else if (studentPool) {
      cycleId = await getActiveCycleId();
      if (!cycleId) {
        await conn.rollback();
        return res.status(409).json({ message: 'No active allocation cycle.' });
      }
    } else {
      // keep existing if not provided
      cycleId = own.cycle_id;
    }

    await conn.query(
      `UPDATE projects
       SET title = ?, description = ?, topic = ?, keywords = ?, quota = ?,
           is_student_pool = ?, cycle_id = ?, updated_at = NOW()
       WHERE project_id = ?`,
      [
        String(title).trim(),
        String(description).trim(),
        topic ? String(topic).trim() : null,
        keywords ? String(keywords).trim() : null,
        q,
        studentPool ? 1 : 0,
        cycleId,
        id,
      ]
    );

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
        p.is_student_pool, p.cycle_id,
        p.created_at, p.updated_at,
        d.full_description, d.prerequisites
       FROM projects p
       LEFT JOIN project_details d ON d.project_id = p.project_id
       WHERE p.project_id = ?`,
      [id]
    );

    res.set('Cache-Control', 'no-store');
    return res.json({ message: 'Project updated.', project: updated });
  } catch (err) {
    await conn.rollback();
    console.error('updateMyProject error:', err);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
};

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
      cycle_id: cycleIdFromBody = null,     // optional
    } = req.body || {};

    const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
    if (!nonEmpty(title) || !nonEmpty(description)) {
      return res.status(400).json({ message: 'Title and description are required.' });
    }

    const q = Number(quota);
    if (!Number.isInteger(q) || q < 1) {
      return res.status(400).json({ message: 'Quota must be an integer ≥ 1.' });
    }

    // Decide cycle_id for ALL projects (may be NULL if no open cycle)
    let cycleId = null;
    if (cycleIdFromBody !== null && String(cycleIdFromBody).trim() !== '') {
      const parsed = Number(cycleIdFromBody);
      if (Number.isInteger(parsed) && parsed > 0) cycleId = parsed;
    }
    if (!cycleId) {
      // If there is an active cycle, attach to it; otherwise leave NULL (draft)
      try {
        const active = await getActiveCycleId();
        if (active) cycleId = active;
      } catch {
        cycleId = null;
      }
    }

    const supervisor_id   = req.user.user_id;
    const supervisor_name = req.user.name || '';

    const isStudentPool = isStudentIdeaTopic ? isStudentIdeaTopic(topic) : false;

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.query(
        `
        INSERT INTO projects
          (title, description, supervisor_name, topic, keywords,
           quota, spots_filled, approval_status, supervisor_id,
           is_student_pool, cycle_id,
           is_student_proposal, is_archived)
        VALUES (?, ?, ?, ?, ?, ?, 0, 'approved', ?, ?, ?, 0, 0)
        `,
        [
          title.trim(),
          description.trim(),
          supervisor_name,
          topic ? String(topic).trim() : null,
          keywords ? String(keywords).trim() : null,
          q,
          supervisor_id,
          isStudentPool ? 1 : 0,
          cycleId,                         // may be NULL (draft)
        ]
      );

      const project_id = result.insertId;

      await conn.query(
        `INSERT INTO project_details (project_id, full_description, prerequisites)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           full_description = VALUES(full_description),
           prerequisites    = VALUES(prerequisites)`,
        [
          project_id,
          full_description ? String(full_description).trim() : null,
          prerequisites ? String(prerequisites).trim() : null,
        ]
      );

      await conn.commit();

      const [[project]] = await conn.query(
        `SELECT p.project_id, p.title, p.description, p.topic, p.keywords,
                p.quota, p.spots_filled, p.approval_status, p.created_at, p.updated_at,
                p.supervisor_id, p.supervisor_name,
                p.is_student_pool, p.cycle_id,
                p.is_student_proposal, p.is_archived
         FROM projects p
         WHERE p.project_id = ?`,
        [project_id]
      );

      const drafted = project.cycle_id == null;
      res.set('Cache-Control', 'no-store');
      return res.status(201).json({
        message: drafted
          ? 'Project created as a draft (no active cycle). It will appear to students once a cycle is opened.'
          : 'Project created and attached to the active cycle.',
        project,
      });
    } catch (txErr) {
      try { await conn.rollback(); } catch {}
      throw txErr;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Create project error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

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

    res.set('Cache-Control', 'no-store');
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

    res.set('Cache-Control', 'no-store');
    return res.json({ message: 'Project restored' });
  } catch (err) {
    console.error('unarchiveProject error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteMyProject = async (req, res) => {
  const supervisorId = req.user?.user_id;
  const { projectId } = req.params;
  const id = Number(projectId);

  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized' });
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'Invalid projectId' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Ownership check
    const [[own]] = await conn.query(
      `SELECT project_id FROM projects WHERE project_id = ? AND supervisor_id = ?`,
      [id, supervisorId]
    );
    if (!own) {
      await conn.rollback();
      return res.status(404).json({ message: 'Project not found or not yours' });
    }

    // Block if there are allocations
    const [[alloc]] = await conn.query(
      `SELECT COUNT(*) AS c FROM allocations WHERE project_id = ?`,
      [id]
    );
    if ((alloc?.c || 0) > 0) {
      await conn.rollback();
      return res.status(409).json({ message: 'Cannot delete: project has allocated students' });
    }

    // Clean up dependent rows first
    await conn.query(`DELETE FROM preferences      WHERE project_id = ?`, [id]);
    await conn.query(`DELETE FROM project_details  WHERE project_id = ?`, [id]);

    // Finally delete the project
    const [del] = await conn.query(
      `DELETE FROM projects WHERE project_id = ? AND supervisor_id = ?`,
      [id, supervisorId]
    );
    if (!del.affectedRows) {
      await conn.rollback();
      return res.status(500).json({ message: 'Delete failed' });
    }

    await conn.commit();
    res.set('Cache-Control', 'no-store');
    return res.json({ message: 'Project deleted' });
  } catch (err) {
    await conn.rollback();
    console.error('deleteMyProject error:', err);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
};
