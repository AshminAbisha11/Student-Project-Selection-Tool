// utils/cycle.js
const db = require('../config/db');

async function getActiveCycleId() {
  const [byStatus] = await db.query(
    `SELECT cycle_id FROM allocation_cycles
     WHERE status='open'
     ORDER BY submission_open_at DESC LIMIT 1`
  );
  if (byStatus.length) return byStatus[0].cycle_id;

  const [byDate] = await db.query(
    `SELECT cycle_id FROM allocation_cycles
     WHERE NOW() BETWEEN submission_open_at AND submission_close_at
     ORDER BY submission_open_at DESC LIMIT 1`
  );
  return byDate.length ? byDate[0].cycle_id : null;
}
module.exports = { getActiveCycleId };
