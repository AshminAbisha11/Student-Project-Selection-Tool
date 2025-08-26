// src/controllers/allocationController.js
const db = require('../config/db'); // mysql2/promise pool

// ---------------- Config (tweakable weights) ----------------
const WEIGHTS = {
  preferencePoints: { 1: 100, 2: 80, 3: 60, 4: 40, 5: 20 },
  contactedBonus: { Yes: 20, No: 0 },
  timing: { maxStart: 30, perProjectStep: 3 },
};

// ---------------- Helpers ----------------
const normContacted = (v) => {
  if (v == null) return 'No';
  const s = String(v).trim().toLowerCase();
  return s === 'yes' ? 'Yes' : 'No';
};

const scorePair = (prefOrder, contacted, rank) => {
  const prefPts = WEIGHTS.preferencePoints[Number(prefOrder)] || 0;
  const contactedPts = WEIGHTS.contactedBonus[normContacted(contacted)] || 0;
  const r = Math.max(1, Number(rank) || 1);
  const timePts = Math.max(0, WEIGHTS.timing.maxStart - (r - 1) * WEIGHTS.timing.perProjectStep);
  return prefPts + contactedPts + timePts;
};

// ----- Cycle helpers -----
async function getMostRecentCycleId() {
  const [r] = await db.query(
    `SELECT cycle_id FROM allocation_cycles
     ORDER BY submission_open_at DESC
     LIMIT 1`
  );
  return r.length ? r[0].cycle_id : null;
}

async function getActiveCycleId() {
  const [byStatus] = await db.query(
    `SELECT cycle_id FROM allocation_cycles
      WHERE status='open'
      ORDER BY submission_open_at DESC
      LIMIT 1`
  );
  if (byStatus.length) return byStatus[0].cycle_id;

  const [byDate] = await db.query(
    `SELECT cycle_id FROM allocation_cycles
      WHERE NOW() BETWEEN submission_open_at AND submission_close_at
      ORDER BY submission_open_at DESC
      LIMIT 1`
  );
  return byDate.length ? byDate[0].cycle_id : null;
}

async function cycleExists(cycleId) {
  const [r] = await db.query(
    `SELECT 1 FROM allocation_cycles WHERE cycle_id = ? LIMIT 1`,
    [cycleId]
  );
  return r.length > 0;
}

/** Resolve cycle to use: prefer req.body/query cycle_id, else active, else most recent. */
async function resolveCycleId(req) {
  const raw = req.body?.cycle_id ?? req.query?.cycle_id ?? null;

  if (raw != null && String(raw).trim() !== '') {
    const cid = Number(raw);
    if (!Number.isInteger(cid) || cid <= 0 || !(await cycleExists(cid))) {
      const err = new Error('Invalid cycle');
      err.status = 409;
      throw err;
    }
    return { cycleId: cid, source: 'request' };
  }

  const active = await getActiveCycleId();
  if (active) return { cycleId: active, source: 'active' };

  const recent = await getMostRecentCycleId();
  if (recent) return { cycleId: recent, source: 'recent' };

  const err = new Error('No cycles configured');
  err.status = 409;
  throw err;
}

async function loadEligiblePreferences(conn, cycleId) {
  // students already allocated this cycle (exclude)
  const [already] = await conn.query(
    `SELECT student_id FROM allocations WHERE cycle_id = ?`,
    [cycleId]
  );
  const alreadySet = new Set(already.map(r => r.student_id));

  // preferences that point to APPROVED projects in SAME cycle
  const [rows] = await conn.query(
    `
    SELECT
      p.preference_id,
      p.student_id,
      p.project_id,
      p.preference_order,
      p.contacted_supervisor,
      p.submitted_at,
      pr.supervisor_id,
      pr.quota,
      pr.spots_filled,
      pr.approval_status
    FROM preferences p
    JOIN projects pr ON pr.project_id = p.project_id
    WHERE p.cycle_id = ?
      AND pr.cycle_id = ?
      AND pr.approval_status = 'approved'
    `,
    [cycleId, cycleId]
  );

  return rows.filter(r => !alreadySet.has(r.student_id));
}

// capacities are CYCLE-SCOPED
async function loadCapacities(conn, cycleId) {
  // supervisor total quota (global per supervisor, adjust if you store per-cycle instead)
  const [supQuotaRows] = await conn.query(
    `SELECT supervisor_id, quota_total FROM supervisor_meta`
  );
  const supervisorQuota = new Map(
    supQuotaRows.map(r => [r.supervisor_id, Number(r.quota_total || 0)])
  );

  // allocations COUNT in THIS cycle only
  const [supLoad] = await conn.query(
    `
    SELECT pr.supervisor_id, COUNT(*) AS c
    FROM allocations a
    JOIN projects pr ON pr.project_id = a.project_id
    WHERE a.cycle_id = ?
    GROUP BY pr.supervisor_id
    `,
    [cycleId]
  );
  const supervisorAllocated = new Map(
    supLoad.map(r => [r.supervisor_id, Number(r.c)])
  );

  return { supervisorQuota, supervisorAllocated };
}

function rankBySubmissionWithinProject(prefs) {
  const byProject = new Map();
  for (const r of prefs) {
    if (!byProject.has(r.project_id)) byProject.set(r.project_id, []);
    byProject.get(r.project_id).push(r);
  }
  for (const arr of byProject.values()) {
    arr.sort((a, b) => new Date(a.submitted_at || 0) - new Date(b.submitted_at || 0));
    arr.forEach((r, i) => { r.rankWithinProject = i + 1; });
  }
  return prefs;
}

function sortCandidates(cands) {
  return cands.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.preference_order !== b.preference_order)
      return a.preference_order - b.preference_order;
    const at = new Date(a.submitted_at || 0).getTime();
    const bt = new Date(b.submitted_at || 0).getTime();
    if (at !== bt) return at - bt;
    return a.student_id - b.student_id;
  });
}

function greedySelect(candidates, capacities) {
  const { supervisorQuota, supervisorAllocated } = capacities;
  const projectRemaining = new Map();
  const supervisorRemaining = new Map();
  const assigned = new Set();
  const result = [];

  for (const c of candidates) {
    if (!projectRemaining.has(c.project_id)) {
      const left = Math.max(0, (Number(c.quota) || 0) - (Number(c.spots_filled) || 0));
      projectRemaining.set(c.project_id, left);
    }
    if (!supervisorRemaining.has(c.supervisor_id)) {
      const cap =
        (supervisorQuota.get(c.supervisor_id) || 0) -
        (supervisorAllocated.get(c.supervisor_id) || 0);
      supervisorRemaining.set(c.supervisor_id, Math.max(0, cap));
    }
  }

  for (const c of candidates) {
    if (assigned.has(c.student_id)) continue;
    if ((projectRemaining.get(c.project_id) || 0) <= 0) continue;
    if ((supervisorRemaining.get(c.supervisor_id) || 0) <= 0) continue;

    result.push(c);
    assigned.add(c.student_id);
    projectRemaining.set(c.project_id, projectRemaining.get(c.project_id) - 1);
    supervisorRemaining.set(
      c.supervisor_id,
      supervisorRemaining.get(c.supervisor_id) - 1
    );
  }

  return result;
}

// ---------------- Preview (no writes) ----------------
exports.preview = async (req, res) => {
  try {
    const { cycleId } = await resolveCycleId(req);

    let prefs = await loadEligiblePreferences(db, cycleId);
    if (!prefs.length) {
      return res.json({
        allocations: [],
        meta: { reason: 'no-eligible-preferences', cycleId },
      });
    }

    prefs = rankBySubmissionWithinProject(prefs);
    const candidates = prefs.map(r => ({
      ...r,
      contacted_supervisor: normContacted(r.contacted_supervisor),
      score: scorePair(r.preference_order, r.contacted_supervisor, r.rankWithinProject),
    }));

    const selected = greedySelect(
      sortCandidates(candidates),
      await loadCapacities(db, cycleId)
    );

    return res.json({
      allocations: selected,
      meta: {
        totalCandidates: candidates.length,
        proposedAllocations: selected.length,
        cycleId,
      },
    });
  } catch (err) {
    const code = err.status || 500;
    if (code !== 500) return res.status(code).json({ error: err.message });
    console.error('allocation preview error:', err);
    return res.status(500).json({ error: 'Allocator preview failed' });
  }
};

// ---------------- Commit (transactional writes) ----------------
exports.commit = async (req, res) => {
  let conn;
  try {
    const { cycleId } = await resolveCycleId(req);

    conn = await db.getConnection();
    await conn.beginTransaction();

    let prefs = await loadEligiblePreferences(conn, cycleId);
    prefs = rankBySubmissionWithinProject(prefs);
    const candidates = prefs.map(r => ({
      ...r,
      contacted_supervisor: normContacted(r.contacted_supervisor),
      score: scorePair(r.preference_order, r.contacted_supervisor, r.rankWithinProject),
    }));
    const toCommit = greedySelect(
      sortCandidates(candidates),
      await loadCapacities(conn, cycleId)
    );

    let inserted = 0;
    for (const a of toCommit) {
      const [s] = await conn.query(
        `SELECT 1 FROM allocations WHERE student_id = ? AND cycle_id = ? FOR UPDATE`,
        [a.student_id, cycleId]
      );
      if (s.length) continue;

      await conn.query(
        `INSERT INTO allocations
          (student_id, project_id, supervisor_id, score, status, allocated_at, cycle_id, preference_id)
         VALUES (?, ?, ?, ?, 'allocated', NOW(), ?, ?)
         ON DUPLICATE KEY UPDATE score=VALUES(score)`,
        [
          a.student_id,
          a.project_id,
          a.supervisor_id,
          a.score,
          cycleId,
          a.preference_id,
        ]
      );

      inserted++;
    }

    await conn.commit();
    return res.json({ message: 'Allocations committed', inserted, cycleId });
  } catch (err) {
    if (conn) try { await conn.rollback(); } catch {}
    const code = err.status || 500;
    if (code !== 500) return res.status(code).json({ error: err.message });
    console.error('allocation commit error:', err);
    return res.status(500).json({ error: 'Allocator commit failed' });
  } finally {
    if (conn) conn.release();
  }
};

// ---------------- Manual allocate (existing flow, kept) ----------------
exports.allocate = async (req, res) => {
  const supervisorId = req.user.user_id;
  const { project_id, student_id } = req.body;

  if (!project_id || !student_id) {
    return res.status(400).json({ message: 'project_id and student_id are required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [existsStudent] = await conn.query(
      `SELECT 1 FROM allocations WHERE student_id = ? FOR UPDATE`,
      [student_id]
    );
    if (existsStudent.length) {
      throw new Error('Student already allocated to a project');
    }

    const [rows] = await conn.query(
      'SELECT project_id, supervisor_id, quota, spots_filled FROM projects WHERE project_id = ? FOR UPDATE',
      [project_id]
    );
    if (!rows.length) throw new Error('Project not found');

    const project = rows[0];
    if (project.supervisor_id !== supervisorId) throw new Error('Not authorized to allocate for this project');
    if (project.spots_filled >= project.quota) throw new Error('Project quota is full');

    const [upd] = await conn.query(
      'UPDATE projects SET spots_filled = spots_filled + 1 WHERE project_id = ? AND spots_filled < quota',
      [project_id]
    );
    if (upd.affectedRows === 0) throw new Error('Project quota is full');

    await conn.query(
      `INSERT INTO allocations (project_id, student_id, supervisor_id, status)
       VALUES (?, ?, ?, 'allocated')`,
      [project_id, student_id, supervisorId]
    );

    await conn.commit();
    return res.status(201).json({ message: 'Student allocated successfully' });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Student already allocated' });
    }
    return res.status(400).json({ message: err.message || 'Allocation failed' });
  } finally {
    conn.release();
  }
};

// ---------------- Manual deallocate (existing flow, kept) ----------------
exports.deallocate = async (req, res) => {
  const supervisorId = req.user.user_id;
  const { allocation_id } = req.params;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

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

// ---------------- Accept a Student-Idea Proposal (UPDATED) ----------------
exports.acceptStudentIdea = async (req, res) => {
  const supervisorId = req.user?.user_id;
  const { proposal_id } = req.body;

  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized' });
  if (!proposal_id) return res.status(400).json({ message: 'proposal_id required' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { cycleId } = await resolveCycleId(req);

    // 1) Lock proposal (must be student-idea for this supervisor & cycle)
    const [propRows] = await conn.query(
      `
      SELECT p.proposal_id, p.student_id, p.supervisor_id, p.project_id, p.status
      FROM proposals p
      WHERE p.proposal_id = ? AND p.supervisor_id = ? AND p.cycle_id = ?
      FOR UPDATE
      `,
      [proposal_id, supervisorId, cycleId]
    );
    if (!propRows.length) {
      await conn.rollback();
      return res.status(404).json({ message: 'Proposal not found for this cycle/supervisor.' });
    }
    const pr = propRows[0];
    if (pr.project_id) {
      await conn.rollback();
      return res.status(400).json({ message: 'Not a student-idea proposal.' });
    }
    if (pr.status === 'accepted' || pr.status === 'allocated') {
      await conn.rollback();
      return res.status(400).json({ message: 'Already allocated.' });
    }

    // 2) Lock supervisor's student-idea pool row
    const [poolRows] = await conn.query(
      `
      SELECT 
        pool.project_id,
        pool.quota,
        GREATEST(pool.quota - COALESCE(taken.cnt, 0), 0) AS seats_left
      FROM projects AS pool
      LEFT JOIN (
        SELECT a.supervisor_id, a.cycle_id, COUNT(*) AS cnt
        FROM allocations a
        JOIN proposals pr ON pr.proposal_id = a.proposal_id
        WHERE a.status = 'allocated'
          AND pr.project_id IS NULL
        GROUP BY a.supervisor_id, a.cycle_id
      ) AS taken
        ON taken.supervisor_id = pool.supervisor_id
       AND taken.cycle_id      = pool.cycle_id
      WHERE
            pool.cycle_id         = ?
        AND pool.supervisor_id   = ?
        AND pool.is_archived     = 0
        AND pool.approval_status = 'approved'
        AND (pool.is_student_pool = 1 OR pool.topic = 'Student Proposal Ideas')
      LIMIT 1
      FOR UPDATE
      `,
      [cycleId, supervisorId]
    );

    if (!poolRows.length) {
      await conn.rollback();
      return res.status(400).json({ message: 'No student-idea pool found for this cycle.' });
    }
    const pool = poolRows[0];
    if (Number(pool.seats_left ?? 0) <= 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'No seats available in student-idea pool.' });
    }

    // 3) Insert allocation and bump spots_filled
    const [ins] = await conn.query(
      `INSERT INTO allocations (proposal_id, student_id, project_id, supervisor_id, status, allocated_at, cycle_id)
       VALUES (?, ?, ?, ?, 'allocated', NOW(), ?)`,
      [proposal_id, pr.student_id, pool.project_id, supervisorId, cycleId]
    );

    await conn.query(
      `UPDATE projects
         SET spots_filled = LEAST(spots_filled + 1, quota)
       WHERE project_id = ?`,
      [pool.project_id]
    );

    // 4) Mark proposal as accepted
    await conn.query(
      `UPDATE proposals SET status='accepted' WHERE proposal_id = ?`,
      [proposal_id]
    );

    await conn.commit();
    return res.json({ message: 'Proposal accepted and allocated.', allocation_id: ins.insertId });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    const code = err.status || 500;
    if (code !== 500) return res.status(code).json({ error: err.message });
    console.error('acceptStudentIdea error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    conn.release();
  }
};

// ---------------- NEW: list & detail for Allocated Students UI ----------------
exports.listForSupervisor = async (req, res) => {
  try {
    const sid = req.user.user_id;
    const rawCycle = req.query.cycle_id;
    const hasCycle = rawCycle !== undefined && String(rawCycle).trim() !== '';
    const cycleId = hasCycle ? Number(rawCycle) : null;

    const sql = `
      SELECT
        a.allocation_id,
        a.status              AS allocation_status,
        a.allocated_at,
        a.cycle_id,

        a.student_id,
        stu.name              AS student_name,
        stu.email             AS student_email,

        a.supervisor_id,

        p.project_id,
        p.title               AS project_title,
        p.description         AS project_description,
        p.topic               AS project_topic_text,
        p.quota,
        p.spots_filled,
        p.approval_status     AS project_approval_status,

        a.proposal_id,
        pr.title              AS proposal_title,
        pr.description        AS proposal_description,
        pr.file_path          AS proposal_file_path,
        pr.status             AS proposal_status
      FROM allocations a
      JOIN users    stu ON stu.user_id = a.student_id
      JOIN projects p   ON p.project_id = a.project_id
      LEFT JOIN proposals pr ON pr.proposal_id = a.proposal_id
      WHERE a.supervisor_id = ?
        AND a.status = 'allocated'
      ${hasCycle ? 'AND a.cycle_id = ?' : ''}
      ORDER BY a.allocated_at DESC, a.allocation_id DESC
    `;

    const params = hasCycle ? [sid, cycleId] : [sid];
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error('listForSupervisor error:', e);
    res.status(500).json({ message: 'Failed to load allocations' });
  }
};

exports.getOne = async (req, res) => {
  try {
    const sid = req.user.user_id;
    const { allocation_id } = req.params;

    const [rows] = await db.query(
      `
      SELECT
        a.allocation_id,
        a.status              AS allocation_status,
        a.allocated_at,
        a.cycle_id,

        a.student_id,
        stu.name              AS student_name,
        stu.email             AS student_email,

        a.supervisor_id,

        p.project_id,
        p.title               AS project_title,
        p.description         AS project_description,
        p.topic               AS project_topic_text,
        p.quota,
        p.spots_filled,
        p.approval_status     AS project_approval_status,

        a.proposal_id,
        pr.title              AS proposal_title,
        pr.description        AS proposal_description,
        pr.file_path          AS proposal_file_path,
        pr.status             AS proposal_status
      FROM allocations a
      JOIN users    stu ON stu.user_id = a.student_id
      JOIN projects p   ON p.project_id = a.project_id
      LEFT JOIN proposals pr ON pr.proposal_id = a.proposal_id
      WHERE a.allocation_id = ?
        AND a.supervisor_id = ?
      LIMIT 1
      `,
      [allocation_id, sid]
    );

    if (!rows.length) return res.status(404).json({ message: 'Allocation not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('getOne error:', e);
    res.status(500).json({ message: 'Failed to load allocation' });
  }
};

// ---------------- Student: get my allocation ----------------
exports.myAllocationForStudent = async (req, res) => {
  try {
    const sid = req.user.user_id;

    const [rows] = await db.query(
      `SELECT
         a.allocation_id,
         a.status              AS allocation_status,
         a.allocated_at,
         a.cycle_id,

         a.project_id,
         p.title               AS project_title,
         p.description         AS project_description,
         p.topic               AS project_topic,
         p.supervisor_id,

         s.name                AS supervisor_name,
         s.email               AS supervisor_email
       FROM allocations a
       JOIN projects p ON p.project_id = a.project_id
       JOIN users s    ON s.user_id = p.supervisor_id
       WHERE a.student_id = ?
       ORDER BY a.allocated_at DESC
       LIMIT 1`,
      [sid]
    );

    if (!rows.length) return res.json(null);
    res.json(rows[0]);
  } catch (e) {
    console.error('myAllocationForStudent error:', e);
    res.status(500).json({ message: 'Failed to load student allocation' });
  }
};
