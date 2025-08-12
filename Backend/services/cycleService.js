// Backend/services/cycleService.js
const db = require('../config/db');

// Return the most recent open cycle (submissions window)
async function getActiveCycle() {
  const [rows] = await db.query(`
    SELECT *
    FROM allocation_cycles
    WHERE status = 'open'
    ORDER BY cycle_id DESC
    LIMIT 1
  `);
  return rows[0] || null;
}

// True if the submission window is still open (before deadline)
function isSubmissionOpen(cycle) {
  if (!cycle) return false;
  const now = new Date();
  return now < new Date(cycle.submission_close_at);
}

// True if deadline has passed
function hasPassedDeadline(cycle) {
  if (!cycle) return false;
  const now = new Date();
  return now >= new Date(cycle.submission_close_at);
}

module.exports = {
  getActiveCycle,
  isSubmissionOpen,
  hasPassedDeadline,
};
