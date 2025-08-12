// Backend/middleware/submissionWindow.js
const {
  getActiveCycle,
  isSubmissionOpen,
} = require('../services/cycleService');

/**
 * Blocks write requests to preferences when the submission window is closed.
 * Also attaches the active cycle to req.cycle so controllers can use cycle_id.
 */
module.exports = async function submissionWindow(req, res, next) {
  try {
    const cycle = await getActiveCycle();
    if (!cycle) {
      return res.status(403).json({ message: 'No active allocation cycle.' });
    }

    // expose the cycle to downstream controllers
    req.cycle = cycle;

    // only allow writes while the window is open
    if (!isSubmissionOpen(cycle)) {
      return res.status(403).json({ message: 'Submission window is closed.' });
    }

    next();
  } catch (err) {
    console.error('submissionWindow error:', err);
    return res.status(500).json({ message: 'Submission window check failed' });
  }
};
