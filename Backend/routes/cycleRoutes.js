const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const { getActiveCycle, isSubmissionOpen, hasPassedDeadline } = require('../services/cycleService');

router.use(verifyToken);

// GET /cycle/status
router.get('/status', async (req, res) => {
  try {
    const cycle = await getActiveCycle();
    if (!cycle) {
      return res.json({ hasActiveCycle: false });
    }

    const open = isSubmissionOpen(cycle);
    const passed = hasPassedDeadline(cycle);

    return res.json({
      hasActiveCycle: true,
      cycle: {
        cycle_id: cycle.cycle_id,
        name: cycle.name,
        submission_open_at: cycle.submission_open_at,
        submission_close_at: cycle.submission_close_at,
        status: cycle.status,
      },
      isSubmissionOpen: open,
      hasPassedDeadline: passed,
    });
  } catch (e) {
    console.error('GET /cycle/status error:', e);
    return res.status(500).json({ message: 'Failed to fetch cycle status' });
  }
});

module.exports = router;
