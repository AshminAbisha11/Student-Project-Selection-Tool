const db = require('../config/db');

/* -------------------------------------------------------
   Helpers
------------------------------------------------------- */

async function getCycleById(cycle_id, conn = db) {
  const [rows] = await conn.query(
    `SELECT * FROM allocation_cycles WHERE cycle_id = ? LIMIT 1`,
    [cycle_id]
  );
  return rows[0] || null;
}

/**
 * Pick the most relevant active cycle:
 * 1. Prefer cycles explicitly marked "open"
 * 2. Otherwise, prefer cycles whose submission window is currently valid
 * 3. Otherwise, return the latest cycle by submission_open_at
 */
async function getActiveCycle() {
  // Step 1: open cycles
  const [open] = await db.query(
    `SELECT * FROM allocation_cycles
      WHERE status = 'open'
      ORDER BY submission_open_at DESC, cycle_id DESC
      LIMIT 1`
  );
  if (open.length) return open[0];

  // Step 2: still within submission window
  const [withinWindow] = await db.query(
    `SELECT * FROM allocation_cycles
      WHERE NOW() BETWEEN submission_open_at AND submission_close_at
      ORDER BY submission_open_at DESC, cycle_id DESC
      LIMIT 1`
  );
  if (withinWindow.length) return withinWindow[0];

  // Step 3: fallback to latest (may be closed)
  const [latest] = await db.query(
    `SELECT * FROM allocation_cycles
      ORDER BY submission_open_at DESC, cycle_id DESC
      LIMIT 1`
  );
  return latest[0] || null;
}

function isSubmissionOpen(cycle) {
  if (!cycle) return false;
  const now = Date.now();
  const openAt = new Date(cycle.submission_open_at).getTime();
  const closeAt = new Date(cycle.submission_close_at).getTime();
  return Number.isFinite(openAt) && Number.isFinite(closeAt) &&
         openAt <= now && now <= closeAt;
}

function hasPassedDeadline(cycle) {
  if (!cycle) return false;
  const closeAt = new Date(cycle.submission_close_at).getTime();
  return Number.isFinite(closeAt) && Date.now() > closeAt;
}

/* -------------------------------------------------------
   Admin actions
------------------------------------------------------- */
async function openNow(cycle_id, actor_user_id) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const cycle = await getCycleById(cycle_id, conn);
    if (!cycle) throw new Error('Cycle not found');
    if (cycle.status === 'committed') {
      throw new Error('Cycle already committed; cannot re-open.');
    }

    await conn.query(
      `UPDATE allocation_cycles
          SET status='open', submission_open_at = NOW()
        WHERE cycle_id = ?`,
      [cycle_id]
    );

    await conn.commit();
    return { ok: true, cycle_id, status: 'open' };
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    conn.release();
  }
}

async function closeNow(cycle_id, actor_user_id) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const cycle = await getCycleById(cycle_id, conn);
    if (!cycle) throw new Error('Cycle not found');
    if (cycle.status === 'committed') throw new Error('Cycle already committed.');

    await conn.query(
      `UPDATE allocation_cycles
          SET status='closed', submission_close_at = NOW()
        WHERE cycle_id = ?`,
      [cycle_id]
    );

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
  getCycleById,
  getActiveCycle,
  isSubmissionOpen,
  hasPassedDeadline,
  openNow,
  closeNow,
};
