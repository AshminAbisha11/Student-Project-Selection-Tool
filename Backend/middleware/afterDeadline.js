// Backend/middleware/afterDeadline.js
const {
  getActiveCycle,
  hasPassedDeadline,
} = require('../services/cycleService');

/**
 * Allows access only after the submission deadline has passed.
 * Attaches the active cycle on req.cycle for controllers.
 */
module.exports = async function afterDeadline(req, res, next) {
  try {
    const cycle = await getActiveCycle();
    if (!cycle) {
      return res.status(403).json({ message: 'No active allocation cycle.' });
    }

    req.cycle = cycle;

    if (!hasPassedDeadline(cycle)) {
      return res.status(403).json({ message: 'Cannot commit before the deadline.' });
    }

    next();
  } catch (err) {
    console.error('afterDeadline error:', err);
    return res.status(500).json({ message: 'Deadline check failed' });
  }
};
