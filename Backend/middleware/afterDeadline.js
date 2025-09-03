// middleware/afterDeadline.js
const db = require('../config/db');

module.exports = async function afterDeadline(req, res, next) {
  try {
    // 1) Prefer explicit cycle_id from body/query
    const raw = req.body?.cycle_id ?? req.query?.cycle_id ?? null;

    let cycle;
    if (raw != null && String(raw).trim() !== '') {
      const cid = Number(raw);
      const [rows] = await db.query(
        'SELECT * FROM allocation_cycles WHERE cycle_id = ? LIMIT 1',
        [cid]
      );
      if (!rows.length) {
        return res.status(409).json({ message: 'Invalid cycle' });
      }
      cycle = rows[0];
    } else {
      // 2) Otherwise pick the most relevant cycle:
      //    prefer open, then draft, otherwise the latest closed/committed
      const [rows] = await db.query(`
        SELECT * FROM allocation_cycles
        ORDER BY (status='open') DESC, (status='draft') DESC, cycle_id DESC
        LIMIT 1
      `);
      if (!rows.length) {
        return res.status(409).json({ message: 'No cycles configured' });
      }
      cycle = rows[0];
    }

    const now = new Date();
    const closeAt = cycle.submission_close_at
      ? new Date(cycle.submission_close_at)
      : null;

    if (!closeAt) {
      return res.status(409).json({ message: 'Cycle has no close time set' });
    }
    if (now < closeAt) {
      return res
        .status(409)
        .json({ message: 'Submissions are not closed yet (before deadline).' });
    }

    // Stash cycle id for the controller (optional, but handy)
    req.cycleId = cycle.cycle_id;
    next();
  } catch (e) {
    console.error('afterDeadline error:', e);
    res.status(500).json({ message: 'afterDeadline failed' });
  }
};
