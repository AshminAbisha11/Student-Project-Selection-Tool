// src/controllers/allocationController.js
const db = require('../config/db'); // mysql2/promise pool

// ---------------- Config (tweakable weights) ----------------
const WEIGHTS = {
  preferencePoints: { 1: 100, 2: 80, 3: 60, 4: 40, 5: 20 },
  contactedBonus: { Yes: 20, No: 0 },
  timing: { maxStart: 30, perProjectStep: 3 }, // rank 1=30, 2=27, 3=24...
};

// ---------------- Helpers ----------------
const scorePair = (prefOrder, contacted, rank) => {
  const prefPts = WEIGHTS.preferencePoints[prefOrder] || 0;
  const contactedPts = WEIGHTS.contactedBonus[contacted] || 0;
  const timePts = Math.max(0, WEIGHTS.timing.maxStart - (rank - 1) * WEIGHTS.timing.perProjectStep);
  return prefPts + contactedPts + timePts;
};

async function loadEligiblePreferences(conn) {
  // Exclude students already allocated (one-project-per-student)
  const [already] = await conn.query(`SELECT student_id FROM allocations`);
  const alreadySet = new Set(already.map(r => r.student_id));

  const [rows] = await conn.query(`
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
    WHERE pr.approval_status = 'approved'
  `);

  return rows.filter(r => !alreadySet.has(r.student_id));
}

async function loadCapacities(conn) {
  // Supervisor quotas
  const [supQuotaRows] = await conn.query(`SELECT supervisor_id, quota_total FROM supervisor_meta`);
  const supervisorQuota = new Map(supQuotaRows.map(r => [r.supervisor_id, Number(r.quota_total || 0)]));

  // Current supervisor load based on allocations
  const [supLoad] = await conn.query(`
    SELECT pr.supervisor_id, COUNT(*) AS c
    FROM allocations a
    JOIN projects pr ON pr.project_id = a.project_id
    GROUP BY pr.supervisor_id
  `);
  const supervisorAllocated = new Map(supLoad.map(r => [r.supervisor_id, Number(r.c)]));

  return { supervisorQuota, supervisorAllocated };
}

function rankBySubmissionWithinProject(prefs) {
  const byProject = new Map();
  for (const r of prefs) {
    if (!byProject.has(r.project_id)) byProject.set(r.project_id, []);
    byProject.get(r.project_id).push(r);
  }
  for (const arr of byProject.values()) {
    arr.sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));
    arr.forEach((r, i) => { r.rankWithinProject = i + 1; });
  }
  return prefs;
}

function sortCandidates(cands) {
  // deterministic: score DESC, preference_order ASC, submitted_at ASC, student_id ASC
  cands.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.preference_order !== b.preference_order) return a.preference_order - b.preference_order;
    const at = new Date(a.submitted_at).getTime(), bt = new Date(b.submitted_at).getTime();
    if (at !== bt) return at - bt;
    return a.student_id - b.student_id;
  });
  return cands;
}

function greedySelect(candidates, capacities) {
  const { supervisorQuota, supervisorAllocated } = capacities;

  // project remaining is derived live from (quota - spots_filled)
  const projectRemaining = new Map(); // pid -> remaining seats
  const supervisorRemaining = new Map(); // sid -> remaining seats
  const assigned = new Set(); // student_ids

  for (const c of candidates) {
    if (!projectRemaining.has(c.project_id)) {
      const left = Math.max(0, (c.quota || 0) - (c.spots_filled || 0));
      projectRemaining.set(c.project_id, left);
    }
    if (!supervisorRemaining.has(c.supervisor_id)) {
      const cap = (supervisorQuota.get(c.supervisor_id) || 0) - (supervisorAllocated.get(c.supervisor_id) || 0);
      supervisorRemaining.set(c.supervisor_id, Math.max(0, cap));
    }
  }

  const result = [];
  for (const c of candidates) {
    if (assigned.has(c.student_id)) continue;
    if ((projectRemaining.get(c.project_id) || 0) <= 0) continue;
    if ((supervisorRemaining.get(c.supervisor_id) || 0) <= 0) continue;

    result.push({
      student_id: c.student_id,
      project_id: c.project_id,
      supervisor_id: c.supervisor_id,
      score: c.score,
      preference_order: c.preference_order,
      contacted_supervisor: c.contacted_supervisor,
      submitted_at: c.submitted_at,
    });

    assigned.add(c.student_id);
    projectRemaining.set(c.project_id, projectRemaining.get(c.project_id) - 1);
    supervisorRemaining.set(c.supervisor_id, supervisorRemaining.get(c.supervisor_id) - 1);
  }

  return result;
}

// ----- Active cycle helper (match other controllers) -----
async function getActiveCycleId() {
  const [byStatus] = await db.query(
    `SELECT cycle_id FROM allocation_cycles
     WHERE status='open' ORDER BY submission_open_at DESC LIMIT 1`
  );
  if (byStatus.length) return byStatus[0].cycle_id;

  const [byDate] = await db.query(
    `SELECT cycle_id FROM allocation_cycles
     WHERE NOW() BETWEEN submission_open_at AND submission_close_at
     ORDER BY submission_open_at DESC LIMIT 1`
  );
  return byDate.length ? byDate[0].cycle_id : null;
}

// ---------------- Preview (no writes) ----------------
exports.preview = async (req, res) => {
  try {
    const conn = db; // pool is fine for read-only
    let prefs = await loadEligiblePreferences(conn);
    if (!prefs.length) {
      return res.json({ allocations: [], meta: { reason: 'no-eligible-preferences' } });
    }

    prefs = rankBySubmissionWithinProject(prefs);
    const candidates = prefs.map(r => ({
      ...r,
      score: scorePair(r.preference_order, r.contacted_supervisor, r.rankWithinProject),
    }));

    sortCandidates(candidates);
    const capacities = await loadCapacities(conn);
    const selected = greedySelect(candidates, capacities);

    return res.json({
      allocations: selected,
      meta: {
        totalCandidates: candidates.length,
        proposedAllocations: selected.length,
      },
    });
  } catch (err) {
    console.error('allocation preview error:', err);
    return res.status(500).json({ error: 'Allocator preview failed' });
  }
};

// ---------------- Commit (transactional writes) ----------------
exports.commit = async (req, res) => {
  // Either accept a vetted list from client, or recompute here if omitted.
  const { allocations: approved } = req.body || {};
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    let toCommit = approved;
    if (!Array.isArray(toCommit) || !toCommit.length) {
      // recompute server-side to keep it deterministic
      let prefs = await loadEligiblePreferences(conn);
      prefs = rankBySubmissionWithinProject(prefs);
      const candidates = prefs.map(r => ({
        ...r,
        score: scorePair(r.preference_order, r.contacted_supervisor, r.rankWithinProject),
      }));
      sortCandidates(candidates);
      const capacities = await loadCapacities(conn);
      toCommit = greedySelect(candidates, capacities);
    }

    let inserted = 0;
    for (const a of toCommit) {
      // 1) One-project-per-student: block if already allocated
      const [s] = await conn.query(
        `SELECT 1 FROM allocations WHERE student_id = ? FOR UPDATE`,
        [a.student_id]
      );
      if (s.length) continue;

      // 2) Lock project row and check capacity (spots_filled < quota)
      const [[proj]] = await conn.query(
        `SELECT project_id, quota, spots_filled FROM projects WHERE project_id = ? FOR UPDATE`,
        [a.project_id]
      );
      if (!proj || proj.spots_filled >= proj.quota) continue;

      // 3) Supervisor live capacity check
      const [[sup]] = await conn.query(
        `SELECT sm.quota_total AS quota,
                (SELECT COUNT(*) FROM allocations al
                   JOIN projects pr2 ON pr2.project_id = al.project_id
                 WHERE pr2.supervisor_id = ?) AS used
         FROM supervisor_meta sm
         WHERE sm.supervisor_id = ? FOR UPDATE`,
        [a.supervisor_id, a.supervisor_id]
      );
      if (!sup || (sup.quota - (sup.used || 0)) <= 0) continue;

      // 4) Reserve project seat
      const [u] = await conn.query(
        `UPDATE projects
           SET spots_filled = spots_filled + 1
         WHERE project_id = ? AND spots_filled < quota`,
        [a.project_id]
      );
      if (!u.affectedRows) continue; // another txn took the last seat

      // 5) Insert allocation (status optional; set to 'allocated')
      await conn.query(
        `INSERT INTO allocations (student_id, project_id, supervisor_id, score, status)
         VALUES (?, ?, ?, ?, 'allocated')`,
        [a.student_id, a.project_id, a.supervisor_id, a.score]
      );

      inserted += 1;
    }

    await conn.commit();
    return res.json({ message: 'Allocations committed', inserted });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error('allocation commit error:', err);
    return res.status(500).json({ error: 'Allocator commit failed' });
  } finally {
    if (conn) conn.release();
  }
};

// ---------------- Manual allocate (existing flow, kept) ----------------
exports.allocate = async (req, res) => {
  const supervisorId = req.user.user_id; // from verifyToken
  const { project_id, student_id } = req.body;

  if (!project_id || !student_id) {
    return res.status(400).json({ message: 'project_id and student_id are required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // One per student guard (manual)
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

// ---------------- Accept a Student-Idea Proposal (NEW) ----------------
// Allocates a proposal without a project_id into the supervisor's student-idea pool
exports.acceptStudentIdea = async (req, res) => {
  const supervisorId = req.user?.user_id;    // supervisors are authenticated
  const { proposal_id } = req.body;

  if (!supervisorId) return res.status(401).json({ message: 'Unauthorized' });
  if (!proposal_id) return res.status(400).json({ message: 'proposal_id required' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const cycleId = await getActiveCycleId();
    if (!cycleId) {
      await conn.rollback();
      return res.status(409).json({ message: 'Submissions are closed (no active cycle).' });
    }

    // 1) Lock the proposal; ensure it's a student-idea proposal for this supervisor & cycle
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
    if (pr.status === 'allocated') {
      await conn.rollback();
      return res.status(400).json({ message: 'Already allocated.' });
    }

    // 2) Find & lock the supervisor’s student-idea pool row for this cycle
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
    const seatsLeft = Number(pool.seats_left ?? 0);
    if (seatsLeft <= 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'No seats available in student-idea pool.' });
    }

    // 3) Insert allocation tied to the pool project_id
    await conn.query(
      `INSERT INTO allocations (proposal_id, student_id, project_id, supervisor_id, status, allocated_at, cycle_id)
       VALUES (?, ?, ?, ?, 'allocated', NOW(), ?)`,
      [proposal_id, pr.student_id, pool.project_id, supervisorId, cycleId]
    );

    // 4) Mark proposal as allocated
    await conn.query(
      `UPDATE proposals SET status='allocated' WHERE proposal_id = ?`,
      [proposal_id]
    );

    await conn.commit();
    return res.json({ message: 'Proposal accepted and allocated.' });
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    console.error('acceptStudentIdea error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    conn.release();
  }
};
