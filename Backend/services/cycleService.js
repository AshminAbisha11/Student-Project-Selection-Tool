// Backend/services/cycleService.js
const db = require('../config/db');

/* -------------------------------------------------------
   Helpers
------------------------------------------------------- */

/** Load a cycle by id (or null) */
async function getCycleById(cycle_id, conn = db) {
  const [rows] = await conn.query(
    `SELECT *
       FROM allocation_cycles
      WHERE cycle_id = ?
      LIMIT 1`,
    [cycle_id]
  );
  return rows[0] || null;
}

/** Most relevant cycle:
 *  - prefer an OPEN one (if any),
 *  - otherwise the most recently scheduled/closed one by open time.
 */
async function getActiveCycle() {
  const [rows] = await db.query(`
    SELECT *
      FROM allocation_cycles
     ORDER BY (status = 'open') DESC,
              submission_open_at DESC,
              cycle_id DESC
     LIMIT 1
  `);
  return rows[0] || null;
}

/** True when now is within the submission window */
function isSubmissionOpen(cycle) {
  if (!cycle) return false;
  const now = Date.now();
  const openAt  = new Date(cycle.submission_open_at).getTime();
  const closeAt = new Date(cycle.submission_close_at).getTime();
  return Number.isFinite(openAt) && Number.isFinite(closeAt) &&
         openAt <= now && now <= closeAt;
}

/** True once the submission deadline has passed */
function hasPassedDeadline(cycle) {
  if (!cycle) return false;
  const closeAt = new Date(cycle.submission_close_at).getTime();
  return Number.isFinite(closeAt) && Date.now() > closeAt;
}

/* -------------------------------------------------------
   Admin actions (idempotent)
------------------------------------------------------- */

/** Mark the cycle as OPEN *now*.
 *  - sets submission_open_at = NOW()
 *  - requires commit status not 'committed'
 *  - if already open, returns successfully without changes
 */
async function openNow(cycle_id, actor_user_id) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const cycle = await getCycleById(cycle_id, conn);
    if (!cycle) throw new Error('Cycle not found');
    if (cycle.status === 'committed') {
      throw new Error('Cycle already committed; cannot re-open.');
    }
    if (cycle.status === 'open') {
      await conn.commit();
      return { ok: true, cycle_id, status: 'open', submission_open_at: cycle.submission_open_at };
    }

    // sanity: close must be in the future or not set
    const [[{ now }]] = await conn.query(`SELECT NOW() AS now`);
    const nowTs = new Date(now).getTime();
    const closeTs = cycle.submission_close_at ? new Date(cycle.submission_close_at).getTime() : null;
    if (closeTs && closeTs <= nowTs) {
      throw new Error('Close time already passed. Set a future close time before opening.');
    }

    await conn.query(
      `UPDATE allocation_cycles
          SET status='open',
              submission_open_at = NOW()
        WHERE cycle_id = ?`,
      [cycle_id]
    );

    // Optional audit (ignore if table doesn't exist)
    try {
      await conn.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, meta)
         VALUES (?,?,?,?,?)`,
        [actor_user_id, 'CYCLE_OPEN_NOW', 'allocation_cycle', String(cycle_id), JSON.stringify({})]
      );
    } catch {}

    await conn.commit();
    return { ok: true, cycle_id, status: 'open' };
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    conn.release();
  }
}

/** Mark the cycle as CLOSED *now*.
 *  - sets submission_close_at = NOW()
 *  - if already closed, returns successfully without changes
 */
async function closeNow(cycle_id, actor_user_id) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const cycle = await getCycleById(cycle_id, conn);
    if (!cycle) throw new Error('Cycle not found');
    if (cycle.status === 'committed') {
      throw new Error('Cycle already committed.');
    }
    if (cycle.status === 'closed') {
      await conn.commit();
      return { ok: true, cycle_id, status: 'closed', submission_close_at: cycle.submission_close_at };
    }

    await conn.query(
      `UPDATE allocation_cycles
          SET status='closed',
              submission_close_at = NOW()
        WHERE cycle_id = ?`,
      [cycle_id]
    );

    // Optional audit
    try {
      await conn.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, meta)
         VALUES (?,?,?,?,?)`,
        [actor_user_id, 'CYCLE_CLOSE_NOW', 'allocation_cycle', String(cycle_id), JSON.stringify({})]
      );
    } catch {}

    await conn.commit();
    return { ok: true, cycle_id, status: 'closed' };
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = {
  // reads
  getCycleById,
  getActiveCycle,
  isSubmissionOpen,
  hasPassedDeadline,
  // admin actions
  openNow,
  closeNow,
};
