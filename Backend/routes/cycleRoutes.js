// routes/cycleRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');

const verifyToken  = require('../middleware/authMiddleware');
const requireAdmin = require('../middleware/requireAdmin');

// --- helpers for status ---
function secondsBetween(a, b) {
  const A = new Date(a).getTime();
  const B = new Date(b).getTime();
  return Math.max(0, Math.floor((B - A) / 1000));
}

router.use(verifyToken);

/* ===================== READ ===================== */

// GET /cycle/status
router.get('/status', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT *
      FROM allocation_cycles
      WHERE status IN ('open','draft')
      ORDER BY status='open' DESC, cycle_id DESC
      LIMIT 1
    `);

    if (!rows.length) {
      return res.json({ hasActiveCycle: false });
    }

    const cycle = rows[0];
    const now = new Date();

    const isSubmissionOpen = cycle.status === 'open' && now < new Date(cycle.submission_close_at);
    const hasPassedDeadline = now >= new Date(cycle.submission_close_at);

    const secondsUntilClose  = secondsBetween(now, cycle.submission_close_at);
    const secondsUntilCommit = cycle.commit_at ? secondsBetween(now, cycle.commit_at) : 0;

    return res.json({
      hasActiveCycle: true,
      cycle: {
        cycle_id: cycle.cycle_id,
        name: cycle.name,
        submission_open_at: cycle.submission_open_at,
        submission_close_at: cycle.submission_close_at,
        commit_at: cycle.commit_at,
        status: cycle.status, // 'draft' | 'open' | 'closed'
      },
      isSubmissionOpen,
      hasPassedDeadline,
      secondsUntilClose,
      secondsUntilCommit,
      canCommitNow: !!cycle.commit_at && now >= new Date(cycle.commit_at),
    });
  } catch (e) {
    console.error('GET /cycle/status error:', e);
    return res.status(500).json({ message: 'Failed to fetch cycle status' });
  }
});

/* ===================== WRITE (admin) ===================== */

// POST /cycle           -> create a new cycle (draft by default)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const {
      name,
      submission_open_at,
      submission_close_at,
      commit_at = null,
      status = 'draft', // 'draft' or 'open'
    } = req.body || {};

    if (!name || !submission_open_at || !submission_close_at) {
      return res.status(400).json({ message: 'name, submission_open_at, submission_close_at required' });
    }
    if (new Date(submission_close_at) <= new Date(submission_open_at)) {
      return res.status(400).json({ message: 'Close must be after open' });
    }
    if (commit_at && new Date(commit_at) < new Date(submission_close_at)) {
      return res.status(400).json({ message: 'Commit must be on/after close' });
    }

    // only one open cycle at a time
    if (status === 'open') {
      await db.query(`UPDATE allocation_cycles SET status='closed' WHERE status='open'`);
    }

    const [ins] = await db.query(
      `INSERT INTO allocation_cycles (name, submission_open_at, submission_close_at, commit_at, status)
       VALUES (?, ?, ?, ?, ?)`,
      [name, submission_open_at, submission_close_at, commit_at, status]
    );

    const [[row]] = await db.query(`SELECT * FROM allocation_cycles WHERE cycle_id=?`, [ins.insertId]);
    res.status(201).json(row);
  } catch (e) {
    console.error('POST /cycle error:', e);
    res.status(500).json({ message: 'Failed to create cycle' });
  }
});

// PATCH /cycle/:id      -> update fields of an existing cycle
router.patch('/:cycle_id', requireAdmin, async (req, res) => {
  try {
    const { cycle_id } = req.params;
    const { name, submission_open_at, submission_close_at, commit_at, status } = req.body || {};

    // build dynamic SET
    const fields = [];
    const vals = [];
    if (name !== undefined) { fields.push('name=?'); vals.push(name); }
    if (submission_open_at !== undefined) { fields.push('submission_open_at=?'); vals.push(submission_open_at); }
    if (submission_close_at !== undefined) { fields.push('submission_close_at=?'); vals.push(submission_close_at); }
    if (commit_at !== undefined) { fields.push('commit_at=?'); vals.push(commit_at); }
    if (status !== undefined) { fields.push('status=?'); vals.push(status); }
    if (!fields.length) return res.status(400).json({ message: 'No fields to update' });

    // if status is being set to 'open', close any other open cycle first
    if (status === 'open') {
      await db.query(`UPDATE allocation_cycles SET status='closed' WHERE status='open' AND cycle_id<>?`, [cycle_id]);
    }

    vals.push(cycle_id);
    await db.query(`UPDATE allocation_cycles SET ${fields.join(', ')} WHERE cycle_id=?`, vals);

    const [[row]] = await db.query(`SELECT * FROM allocation_cycles WHERE cycle_id=?`, [cycle_id]);
    res.json(row);
  } catch (e) {
    console.error('PATCH /cycle/:id error:', e);
    res.status(500).json({ message: 'Failed to update cycle' });
  }
});

// POST /cycle/:id/open?now=1
router.post('/:cycle_id/open', requireAdmin, async (req, res) => {
  try {
    const { cycle_id } = req.params;
    const setNow = String(req.query.now || '') === '1';

    await db.query(`UPDATE allocation_cycles SET status='closed' WHERE status='open' AND cycle_id<>?`, [cycle_id]);
    await db.query(
      `UPDATE allocation_cycles
         SET status='open', submission_open_at = IF(?, NOW(), submission_open_at)
       WHERE cycle_id=?`,
      [setNow, cycle_id]
    );
    res.json({ message: 'Cycle opened' });
  } catch (e) {
    console.error('POST /cycle/:id/open error:', e);
    res.status(500).json({ message: 'Failed to open cycle' });
  }
});

// POST /cycle/:id/close?now=1
router.post('/:cycle_id/close', requireAdmin, async (req, res) => {
  try {
    const { cycle_id } = req.params;
    const setNow = String(req.query.now || '') === '1';

    await db.query(
      `UPDATE allocation_cycles
         SET status='closed', submission_close_at = IF(?, NOW(), submission_close_at)
       WHERE cycle_id=?`,
      [setNow, cycle_id]
    );
    res.json({ message: 'Cycle closed' });
  } catch (e) {
    console.error('POST /cycle/:id/close error:', e);
    res.status(500).json({ message: 'Failed to close cycle' });
  }
});

// POST /cycle/:id/commit-now
router.post('/:cycle_id/commit-now', requireAdmin, async (req, res) => {
  try {
    const { cycle_id } = req.params;
    await db.query(`UPDATE allocation_cycles SET commit_at = NOW() WHERE cycle_id=?`, [cycle_id]);
    res.json({ message: 'Commit time set to now' });
  } catch (e) {
    console.error('POST /cycle/:id/commit-now error:', e);
    res.status(500).json({ message: 'Failed to set commit time' });
  }
});

module.exports = router;
