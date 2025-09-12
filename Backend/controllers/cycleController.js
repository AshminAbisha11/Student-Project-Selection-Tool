// controllers/cycleController.js
const db = require('../config/db');
const { toSqlDate } = require('../utils/dateUtil');

/* ---------------- Helpers ---------------- */
function toSqlOrNull(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  if (!s || /dd-?mm-?yyyy/i.test(s) || s.includes('--:--')) return null;
  return toSqlDate(s);
}
function assertValidStatus(status) {
  if (
    status !== undefined &&
    !['draft', 'open', 'closed', 'committed'].includes(String(status))
  ) {
    const err = new Error('Invalid status');
    err.status = 400;
    throw err;
  }
}

/* ---------------- READ ---------------- */

// GET /cycle/active
exports.getActive = async (_req, res) => {
  try {
    const [[row]] = await db.query(`
      SELECT *
      FROM allocation_cycles
      WHERE status='open'
      ORDER BY submission_open_at DESC
      LIMIT 1
    `);
    res.json(row || null);
  } catch (e) {
    console.error('getActive error:', e);
    res.status(500).json({ message: 'Failed to fetch active cycle' });
  }
};

// GET /cycle/status
// Choose the “most relevant” cycle for dashboards (open > draft > latest created)
// and compute smart flags for banners & buttons.
exports.getStatus = async (_req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT *
      FROM allocation_cycles
      ORDER BY (status='open') DESC, (status='draft') DESC, cycle_id DESC
      LIMIT 1
    `);

    const [[openRow]] = await db.query(`
      SELECT *
      FROM allocation_cycles
      WHERE status='open'
      ORDER BY submission_open_at DESC
      LIMIT 1
    `);

    if (!rows.length) {
      return res.json({
        hasAnyCycle: false,
        hasActiveCycle: false,
        cycle: null,
        isSubmissionOpen: false,
        hasPassedDeadline: false,
        secondsUntilClose: 0,
        secondsUntilCommit: 0,
        canCommitNow: false,
      });
    }

    const cycle = rows[0];
    const now = new Date();

    const closeAt =
      cycle.submission_close_at ? new Date(cycle.submission_close_at) : null;
    const commitAt =
      cycle.commit_at ? new Date(cycle.commit_at) : null;

    const isOpen = cycle.status === 'open';
    const isSubmissionOpen = isOpen && !!closeAt && now < closeAt;
    const hasPassedDeadline = !!closeAt && now >= closeAt;

    // You can "Commit Now" when:
    // - we are not in the open submission window, AND
    // - either there is no commit_at (immediate), or we are past commit_at, or we are past the submission deadline.
    const canCommitNow = !isOpen && (hasPassedDeadline || !commitAt || now >= commitAt);

    res.json({
      hasAnyCycle: true,
      hasActiveCycle: !!openRow,
      cycle,
      isSubmissionOpen,
      hasPassedDeadline,
      secondsUntilClose: closeAt && now < closeAt ? Math.floor((closeAt - now) / 1000) : 0,
      secondsUntilCommit: commitAt && now < commitAt ? Math.floor((commitAt - now) / 1000) : 0,
      canCommitNow,
    });
  } catch (e) {
    console.error('getStatus error:', e);
    res.status(500).json({ message: 'Failed to fetch cycle status' });
  }
};

// GET /cycles (list all)
exports.list = async (_req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT *
      FROM allocation_cycles
      ORDER BY submission_open_at DESC
    `);
    res.json(rows);
  } catch (e) {
    console.error('list cycles error:', e);
    res.status(500).json({ message: 'Failed to list cycles' });
  }
};

/* ---------------- WRITE ---------------- */

// POST /cycle
exports.create = async (req, res) => {
  try {
    const {
      name,
      submission_open_at,
      submission_close_at,
      commit_at,
      status = 'draft',
    } = req.body || {};

    assertValidStatus(status);

    if (!name || !submission_open_at || !submission_close_at) {
      return res
        .status(400)
        .json({ message: 'name, submission_open_at, submission_close_at required' });
    }

    const sqlOpen = toSqlDate(submission_open_at);
    const sqlClose = toSqlDate(submission_close_at);
    const sqlCommit = commit_at ? toSqlDate(commit_at) : null;

    if (sqlClose <= sqlOpen)
      return res.status(400).json({ message: 'Close must be after open' });
    if (sqlCommit && sqlCommit < sqlClose)
      return res.status(400).json({ message: 'Commit must be on/after close' });

    if (status === 'open') {
      await db.query(`UPDATE allocation_cycles SET status='closed' WHERE status='open'`);
    }
    if (status === 'committed') {
      await db.query(`UPDATE allocation_cycles SET status='closed' WHERE status='committed'`);
    }

    const [ins] = await db.query(
      `INSERT INTO allocation_cycles (name, submission_open_at, submission_close_at, commit_at, status)
       VALUES (?,?,?,?,?)`,
      [name, sqlOpen, sqlClose, sqlCommit, status]
    );

    const [[row]] = await db.query(
      `SELECT * FROM allocation_cycles WHERE cycle_id=?`,
      [ins.insertId]
    );
    res.status(201).json(row);
  } catch (e) {
    console.error('create cycle error:', e);
    res.status(e.status || 500).json({ message: e.message || 'Failed to create cycle' });
  }
};

// PATCH /cycle/:id
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      submission_open_at,
      submission_close_at,
      commit_at,
      status,
    } = req.body || {};

    assertValidStatus(status);

    const [[current]] = await db.query(
      `SELECT * FROM allocation_cycles WHERE cycle_id=?`,
      [id]
    );
    if (!current) return res.status(404).json({ message: 'Cycle not found' });

    const sqlOpen   = toSqlOrNull(submission_open_at);
    const sqlClose  = toSqlOrNull(submission_close_at);
    const sqlCommit = toSqlOrNull(commit_at);

    const nextOpen   = sqlOpen   !== undefined ? sqlOpen   : current.submission_open_at;
    const nextClose  = sqlClose  !== undefined ? sqlClose  : current.submission_close_at;
    const nextCommit = sqlCommit !== undefined ? sqlCommit : current.commit_at;

    if (nextClose <= nextOpen)
      return res.status(400).json({ message: 'Close must be after open' });
    if (nextCommit && nextCommit < nextClose)
      return res.status(400).json({ message: 'Commit must be on/after close' });

    const fields = [], vals = [];
    if (name   !== undefined) { fields.push('name=?'); vals.push(name); }
    if (sqlOpen   !== undefined) { fields.push('submission_open_at=?');  vals.push(sqlOpen); }
    if (sqlClose  !== undefined) { fields.push('submission_close_at=?'); vals.push(sqlClose); }
    if (sqlCommit !== undefined) { fields.push('commit_at=?');           vals.push(sqlCommit); }
    if (status    !== undefined) { fields.push('status=?');              vals.push(status); }

    if (!fields.length)
      return res.status(400).json({ message: 'No fields to update' });

    if (status === 'open') {
      await db.query(
        `UPDATE allocation_cycles SET status='closed' WHERE status='open' AND cycle_id<>?`,
        [id]
      );
    }
    if (status === 'committed') {
      await db.query(
        `UPDATE allocation_cycles SET status='closed' WHERE status='committed' AND cycle_id<>?`,
        [id]
      );
    }

    vals.push(id);
    await db.query(
      `UPDATE allocation_cycles SET ${fields.join(', ')} WHERE cycle_id=?`,
      vals
    );

    const [[row]] = await db.query(
      `SELECT * FROM allocation_cycles WHERE cycle_id=?`,
      [id]
    );
    res.json(row);
  } catch (e) {
    console.error('update cycle error:', e);
    res.status(e.status || 500).json({ message: e.message || 'Failed to update cycle' });
  }
};

// POST /cycle/:id/open
// Open the cycle now and seed projects from last cycle + drafts.
exports.openNow = async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const cycleId = Number(id);

    conn = await db.getConnection();
    await conn.beginTransaction();

    // 1) Close any other open cycle
    await conn.query(
      `UPDATE allocation_cycles
         SET status='closed'
       WHERE status='open' AND cycle_id <> ?`,
      [cycleId]
    );

    // 2) Open this one now (ensure open timestamp reflects the action)
    await conn.query(
      `UPDATE allocation_cycles
         SET status='open', submission_open_at = NOW()
       WHERE cycle_id = ?`,
      [cycleId]
    );

    // 3) Seed projects from the most recent previous cycle (if any)
    const [prevRows] = await conn.query(
      `SELECT cycle_id
         FROM allocation_cycles
        WHERE cycle_id <> ?
        ORDER BY submission_open_at DESC
        LIMIT 1`,
      [cycleId]
    );

    if (prevRows.length) {
      const prevId = prevRows[0].cycle_id;

      // (3a) Copy approved, non-archived projects (avoid duplicates by supervisor+title per cycle)
      await conn.query(
        `
        INSERT INTO projects (
          title, description, supervisor_id, supervisor_name, cycle_id,
          quota, spots_filled, approval_status, is_student_pool, is_archived, topic, keywords
        )
        SELECT
          src.title, src.description, src.supervisor_id, COALESCE(src.supervisor_name, ''),
          ? AS cycle_id,
          src.quota, 0, src.approval_status, src.is_student_pool, 0, src.topic, src.keywords
        FROM projects src
        LEFT JOIN projects dst
          ON  dst.supervisor_id = src.supervisor_id
          AND dst.title         = src.title
          AND dst.cycle_id      = ?
        WHERE src.cycle_id = ?
          AND src.is_archived = 0
          AND LOWER(TRIM(src.approval_status)) = 'approved'
          AND dst.project_id IS NULL
        `,
        [cycleId, cycleId, prevId]
      );

      // (3b) Copy project_details for newly created rows
      await conn.query(
        `
        INSERT INTO project_details (project_id, full_description, prerequisites)
        SELECT
          dst.project_id,
          det.full_description,
          det.prerequisites
        FROM projects dst
        JOIN projects src
          ON  src.supervisor_id = dst.supervisor_id
          AND src.title         = dst.title
          AND src.cycle_id      = ?
        LEFT JOIN project_details det
          ON det.project_id     = src.project_id
        LEFT JOIN project_details already
          ON already.project_id = dst.project_id
        WHERE dst.cycle_id = ?
          AND already.project_id IS NULL
        `,
        [prevId, cycleId]
      );
    }

    // 4) Seed from “draft” projects (where cycle_id IS NULL)
    await conn.query(
      `
      INSERT INTO projects (
        title, description, supervisor_id, supervisor_name, cycle_id,
        quota, spots_filled, approval_status, is_student_pool, is_archived, topic, keywords
      )
      SELECT
        src.title, src.description, src.supervisor_id, COALESCE(src.supervisor_name, ''),
        ? AS cycle_id,
        src.quota, 0, src.approval_status, src.is_student_pool, 0, src.topic, src.keywords
      FROM projects src
      LEFT JOIN projects dst
        ON  dst.supervisor_id = src.supervisor_id
        AND dst.title         = src.title
        AND dst.cycle_id      = ?
      WHERE src.cycle_id IS NULL
        AND src.is_archived = 0
        AND LOWER(TRIM(src.approval_status)) = 'approved'
        AND dst.project_id IS NULL
      `,
      [cycleId, cycleId]
    );

    await conn.query(
      `
      INSERT INTO project_details (project_id, full_description, prerequisites)
      SELECT
        dst.project_id,
        det.full_description,
        det.prerequisites
      FROM projects dst
      JOIN projects src
        ON  src.supervisor_id = dst.supervisor_id
        AND src.title         = dst.title
        AND src.cycle_id      IS NULL
      LEFT JOIN project_details det
        ON det.project_id     = src.project_id
      LEFT JOIN project_details already
        ON already.project_id = dst.project_id
      WHERE dst.cycle_id = ?
        AND already.project_id IS NULL
      `,
      [cycleId]
    );

    await conn.commit();
    res.json({ message: 'Cycle opened successfully (seeded from previous cycle and drafts).' });
  } catch (e) {
    if (conn) try { await conn.rollback(); } catch {}
    console.error('openNow error:', e);
    res.status(500).json({ message: 'Failed to open cycle' });
  } finally {
    if (conn) conn.release();
  }
};

// POST /cycle/:id/close
exports.closeNow = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(
      `UPDATE allocation_cycles
          SET status='closed', submission_close_at=NOW()
        WHERE cycle_id=?`,
      [id]
    );
    res.json({ message: 'Cycle closed' });
  } catch (e) {
    console.error('closeNow error:', e);
    res.status(500).json({ message: 'Failed to close cycle' });
  }
};

// POST /cycle/:id/commit-now
// Mark the cycle as committed WITHOUT running the allocator.
// Ensures only one committed cycle at a time and back-fills close time if missing.
exports.commitNow = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query(
      `UPDATE allocation_cycles
         SET status='closed'
       WHERE status='committed' AND cycle_id <> ?`,
      [id]
    );

    await db.query(
      `UPDATE allocation_cycles
          SET status='committed',
              submission_close_at = COALESCE(submission_close_at, NOW()),
              commit_at = NOW()
        WHERE cycle_id = ?`,
      [id]
    );

    res.json({ message: 'Cycle marked as committed' });
  } catch (e) {
    console.error('commitNow error:', e);
    res.status(500).json({ message: 'Failed to set commit' });
  }
};

/* --------- Archive (mapped to closed) & Delete (force-aware) ---------- */

// PATCH /cycle/:id/archive  (since status doesn't support 'archived', map to 'closed')
exports.archive = async (req, res) => {
  try {
    const { id } = req.params;
    const [upd] = await db.query(
      `UPDATE allocation_cycles
         SET status='closed'
       WHERE cycle_id = ?`,
      [id]
    );
    if (!upd.affectedRows)
      return res.status(404).json({ message: 'Cycle not found' });
    res.json({ message: 'Cycle archived (set to closed)' });
  } catch (e) {
    console.error('archive cycle error:', e);
    res.status(500).json({ message: 'Failed to archive cycle' });
  }
};

// DELETE /cycle/:id  (use ?force=1 to delete even with allocations/projects)
exports.remove = async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const force = String(req.query.force || '').trim() === '1';

    const [[row]] = await db.query(
      `SELECT * FROM allocation_cycles WHERE cycle_id=?`,
      [id]
    );
    if (!row) return res.status(404).json({ message: 'Cycle not found' });

    const [[allocs]] = await db.query(
      `SELECT COUNT(*) AS c FROM allocations WHERE cycle_id=?`,
      [id]
    );
    const [[projs]] = await db.query(
      `SELECT COUNT(*) AS c FROM projects WHERE cycle_id=?`,
      [id]
    );

    if ((allocs.c > 0 || projs.c > 0) && !force) {
      return res.status(400).json({
        message:
          `Cannot delete cycle with existing data (allocations=${allocs.c}, projects=${projs.c}). ` +
          `Pass ?force=1 to delete and remove related data.`,
      });
    }

    conn = await db.getConnection();
    await conn.beginTransaction();

    if (allocs.c > 0) {
      await conn.query(`DELETE FROM allocations WHERE cycle_id = ?`, [id]);
    }

    if (projs.c > 0) {
      // Will cascade to project_details; allocations.project_id is ON DELETE SET NULL; preferences has ON DELETE CASCADE
      await conn.query(`DELETE FROM projects WHERE cycle_id = ?`, [id]);
    }

    await conn.query(`DELETE FROM allocation_cycles WHERE cycle_id = ?`, [id]);

    await conn.commit();
    res.json({ message: 'Cycle deleted', cycle_id: id, forced: allocs.c > 0 || projs.c > 0 });
  } catch (e) {
    if (conn) try { await conn.rollback(); } catch {}
    console.error('delete cycle error:', e);
    res.status(500).json({ message: 'Failed to delete cycle' });
  } finally {
    if (conn) conn.release();
  }
};
