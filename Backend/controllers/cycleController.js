// controllers/cycleController.js
const db = require('../config/db');
const { toSqlDate } = require('../utils/dateUtil');

/* ---------------- Helpers ---------------- */
function secondsBetween(a, b) {
  if (!a || !b) return 0;
  const A = new Date(a).getTime();
  const B = new Date(b).getTime();
  if (Number.isNaN(A) || Number.isNaN(B)) return 0;
  return Math.max(0, Math.floor((B - A) / 1000));
}
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
// GET /cycle/status
exports.getStatus = async (_req, res) => {
  try {
    // Return the most relevant cycle: prefer open, then draft, else latest closed/committed
    const [rows] = await db.query(`
      SELECT * FROM allocation_cycles
      ORDER BY (status='open') DESC, (status='draft') DESC, cycle_id DESC
      LIMIT 1
    `);

    if (!rows.length) return res.json({ hasActiveCycle: false });

    const cycle = rows[0];
    const now = new Date();

    const closeAt = cycle.submission_close_at ? new Date(cycle.submission_close_at) : null;
    const isSubmissionOpen = cycle.status === 'open' && closeAt && now < closeAt;
    const hasPassedDeadline = !!closeAt && now >= closeAt;

    res.json({
      hasActiveCycle: true,
      cycle,
      isSubmissionOpen,
      hasPassedDeadline,
      secondsUntilClose: closeAt ? Math.max(0, Math.floor((closeAt - now) / 1000)) : 0,
      secondsUntilCommit: cycle.commit_at ? Math.max(0, Math.floor((new Date(cycle.commit_at) - now) / 1000)) : 0,
      canCommitNow: !!cycle.commit_at && now >= new Date(cycle.commit_at),
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
      SELECT * FROM allocation_cycles
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

    const sqlOpen = toSqlOrNull(submission_open_at);
    const sqlClose = toSqlOrNull(submission_close_at);
    const sqlCommit = toSqlOrNull(commit_at);

    const nextOpen = sqlOpen !== undefined ? sqlOpen : current.submission_open_at;
    const nextClose = sqlClose !== undefined ? sqlClose : current.submission_close_at;
    const nextCommit = sqlCommit !== undefined ? sqlCommit : current.commit_at;

    if (nextClose <= nextOpen)
      return res.status(400).json({ message: 'Close must be after open' });
    if (nextCommit && nextCommit < nextClose)
      return res.status(400).json({ message: 'Commit must be on/after close' });

    const fields = [], vals = [];
    if (name !== undefined) { fields.push('name=?'); vals.push(name); }
    if (sqlOpen !== undefined) { fields.push('submission_open_at=?'); vals.push(sqlOpen); }
    if (sqlClose !== undefined) { fields.push('submission_close_at=?'); vals.push(sqlClose); }
    if (sqlCommit !== undefined) { fields.push('commit_at=?'); vals.push(sqlCommit); }
    if (status !== undefined) { fields.push('status=?'); vals.push(status); }

    if (!fields.length)
      return res.status(400).json({ message: 'No fields to update' });

    if (status === 'open') {
      await db.query(
        `UPDATE allocation_cycles SET status='closed' WHERE status='open' AND cycle_id<>?`,
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
// Auto-seed projects from the latest previous cycle into this cycle
// POST /cycle/:id/open
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

    // 2) Open this one now
    await conn.query(
      `UPDATE allocation_cycles
         SET status='open', submission_open_at = NOW()
       WHERE cycle_id = ?`,
      [cycleId]
    );

    // 3) Most recent previous cycle (if any)
    const [prevRows] = await conn.query(
      `SELECT cycle_id
         FROM allocation_cycles
        WHERE cycle_id <> ?
        ORDER BY submission_open_at DESC
        LIMIT 1`,
      [cycleId]
    );

    /* ----------------------------
       Seed from previous cycle
       ---------------------------- */
    if (prevRows.length) {
      const prevId = prevRows[0].cycle_id;

      // (3a) Insert projects from previous cycle (approved, not archived)
      await conn.query(
        `
        INSERT INTO projects (
          title,
          description,
          supervisor_id,
          supervisor_name,
          cycle_id,
          quota,
          spots_filled,
          approval_status,
          is_student_pool,
          is_archived,
          topic,
          keywords
        )
        SELECT
          src.title,
          src.description,
          src.supervisor_id,
          COALESCE(src.supervisor_name, ''),
          ? AS cycle_id,
          src.quota,
          0 AS spots_filled,
          src.approval_status,
          src.is_student_pool,
          0 AS is_archived,
          src.topic,
          src.keywords
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

      // (3b) Copy project_details for those newly-created rows that came from prev cycle
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
         AND src.cycle_id       = ?
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

    /* ----------------------------
       Seed from "drafts" (cycle_id IS NULL)
       ---------------------------- */

    // (4a) Insert projects created without a cycle (drafts)
    await conn.query(
      `
      INSERT INTO projects (
        title,
        description,
        supervisor_id,
        supervisor_name,
        cycle_id,
        quota,
        spots_filled,
        approval_status,
        is_student_pool,
        is_archived,
        topic,
        keywords
      )
      SELECT
        src.title,
        src.description,
        src.supervisor_id,
        COALESCE(src.supervisor_name, ''),
        ? AS cycle_id,
        src.quota,
        0 AS spots_filled,
        src.approval_status,
        src.is_student_pool,
        0 AS is_archived,
        src.topic,
        src.keywords
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

    // (4b) Copy project_details for newly-created rows that came from drafts (src.cycle_id IS NULL)
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
       AND src.cycle_id       IS NULL
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
// POST /cycle/:id/commit-now
exports.commitNow = async (req, res) => {
  try {
    const { id } = req.params;
    // Only set commit time; don't flip status here
    await db.query(`UPDATE allocation_cycles SET commit_at = NOW() WHERE cycle_id = ?`, [id]);
    res.json({ message: 'Commit time set to now' });
  } catch (e) {
    console.error('commitNow error:', e);
    res.status(500).json({ message: 'Failed to set commit time' });
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
