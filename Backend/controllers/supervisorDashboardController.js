// controllers/supervisorController.js
const db = require('../config/db');

/* ---------------- Cycle helpers ---------------- */
async function getMostRecentCycleId() {
  const [r] = await db.query(
    `SELECT cycle_id
       FROM allocation_cycles
      ORDER BY submission_open_at DESC, cycle_id DESC
      LIMIT 1`
  );
  return r.length ? r[0].cycle_id : null;
}

async function getActiveCycleId() {
  const [byStatus] = await db.query(
    `SELECT cycle_id
       FROM allocation_cycles
      WHERE status='open'
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

/**
 * Resolve which cycle to use for the overview.
 * Priority:
 *   1) explicit cycle_id / cycle query
 *   2) active cycle
 *   3) latest cycle this supervisor has used (projects/allocations)
 *   4) most recent cycle in system
 *   5) null (no cycle) -> treated as 'all'
 */
async function resolveOverviewCycle(req, supervisorId) {
  const rawId =
    req.query?.cycle_id ??
    req.query?.cycleId ??
    ( /^\d+$/.test(String(req.query?.cycle || '')) ? req.query.cycle : null );

  if (rawId != null && String(rawId).trim() !== '') {
    const cid = Number(rawId);
    if (Number.isInteger(cid) && cid > 0) return { cycleId: cid, source: 'request' };
  }

  const mode = String(req.query?.cycle || 'active').toLowerCase();
  if (mode === 'all') return { cycleId: null, source: 'all' };
  if (mode === 'active' || mode === '') {
    const active = await getActiveCycleId();
    if (active) return { cycleId: active, source: 'active' };
  }

  // Latest this supervisor actually used (projects first, then allocations)
  const [[latestProj]] = await db.query(
    `SELECT cycle_id
       FROM projects
      WHERE supervisor_id = ?
        AND cycle_id IS NOT NULL
      ORDER BY COALESCE(updated_at, created_at) DESC
      LIMIT 1`,
    [supervisorId]
  );
  if (latestProj) return { cycleId: latestProj.cycle_id, source: 'latest-project' };

  try {
    const [[latestAlloc]] = await db.query(
      `SELECT cycle_id
         FROM allocations
        WHERE supervisor_id = ?
        ORDER BY allocated_at DESC
        LIMIT 1`,
      [supervisorId]
    );
    if (latestAlloc) return { cycleId: latestAlloc.cycle_id, source: 'latest-allocation' };
  } catch (e) {
    // allocations table may not exist in some schemas; ignore
    if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
  }

  const recent = await getMostRecentCycleId();
  if (recent) return { cycleId: recent, source: 'recent' };

  return { cycleId: null, source: 'none' }; // fall back to 'all'
}

/* ---------------- Dashboard Overview ---------------- */
/**
 * GET /supervisor/overview
 * Auth: requires req.user (supervisor)
 * Query (optional):
 *   - cycle_id=<id> or cycle=<id|active|latest|all>
 *
 * Response:
 * {
 *   projects: number,
 *   pendingProposals: number,
 *   allocatedStudents: number,
 *   meta: { cycle_filter: number|null, cycle_source: string }
 * }
 */
exports.getOverview = async (req, res) => {
  try {
    const supervisorId = req.user?.user_id;
    if (!supervisorId) return res.status(401).json({ message: 'Unauthorized' });

    // Decide which cycle to summarize
    const { cycleId, source } = await resolveOverviewCycle(req, supervisorId);

    /* -------- Projects count (exclude archived + student-idea pool) -------- */
    const projWhere = [
      `supervisor_id = ?`,
      `COALESCE(is_archived, 0) = 0`,
      `COALESCE(is_student_pool, 0) = 0`
    ];
    const projParams = [supervisorId];
    if (cycleId != null) {
      projWhere.push(`cycle_id = ?`);
      projParams.push(cycleId);
    }

    const [[projRow]] = await db.query(
      `SELECT COUNT(*) AS projects FROM projects WHERE ${projWhere.join(' AND ')}`,
      projParams
    );

    /* -------- Pending proposals (in chosen cycle if provided) -------- */
    const propWhere = [
      `supervisor_id = ?`,
      `(status IS NULL OR status IN ('pending','submitted','under_review'))`
    ];
    const propParams = [supervisorId];
    if (cycleId != null) {
      propWhere.push(`cycle_id = ?`);
      propParams.push(cycleId);
    }

    const [[propRow]] = await db.query(
      `SELECT COUNT(*) AS pendingProposals FROM proposals WHERE ${propWhere.join(' AND ')}`,
      propParams
    );

    /* -------- Allocated students (distinct) -------- */
    let allocatedStudents = 0;
    try {
      const allocWhere = [
        `supervisor_id = ?`,
        `status = 'allocated'`
      ];
      const allocParams = [supervisorId];
      if (cycleId != null) {
        allocWhere.push(`cycle_id = ?`);
        allocParams.push(cycleId);
      }

      const [[allocRow]] = await db.query(
        `SELECT COUNT(DISTINCT student_id) AS students
           FROM allocations
          WHERE ${allocWhere.join(' AND ')}`,
        allocParams
      );
      allocatedStudents = Number(allocRow?.students || 0);
    } catch (e) {
      if (e.code !== 'ER_NO_SUCH_TABLE') throw e; // ignore if allocations table missing
    }

    res.set('Cache-Control', 'no-store');
    return res.json({
      projects: Number(projRow?.projects || 0),
      pendingProposals: Number(propRow?.pendingProposals || 0),
      allocatedStudents,
      meta: { cycle_filter: cycleId, cycle_source: source }
    });
  } catch (err) {
    console.error('Supervisor overview error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
