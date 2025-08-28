const {
  getActiveCycle,
  isSubmissionOpen,
} = require('../services/cycleService');

/**
 * Blocks write requests to preferences when the submission window is closed.
 * Attaches the active cycle to req.cycle so controllers can use cycle_id.
 */
module.exports = async function submissionWindow(req, res, next) {
  try {
    const cycle = await getActiveCycle();
    if (!cycle) {
      return res.status(403).json({ message: 'No active allocation cycle.' });
    }

    // Attach active cycle to request
    req.cycle = cycle;

    // ✅ Allow if admin explicitly set status='open' OR within the date window
    if (cycle.status === 'open' || isSubmissionOpen(cycle)) {
      return next();
    }

    return res.status(403).json({ message: 'Submission window is closed.' });
  } catch (err) {
    console.error('submissionWindow error:', err);
    return res.status(500).json({ message: 'Submission window check failed' });
  }
};
