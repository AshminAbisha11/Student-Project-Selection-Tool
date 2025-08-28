// routes/cycleRoutes.js
const express = require('express');
const router = express.Router();

const verifyToken  = require('../middleware/authMiddleware');
const requireAdmin = require('../middleware/requireAdmin');
const cycleController = require('../controllers/cycleController');

// All cycle endpoints require auth
router.use(verifyToken);

/* -------- READ -------- */
router.get('/status', cycleController.getStatus);            // anyone logged-in
router.get('/', requireAdmin, cycleController.list);         // admin only

/* -------- WRITE -------- */
router.post('/', requireAdmin, cycleController.create);      // admin only
router.patch('/:id', requireAdmin, cycleController.update);  // admin only

router.post('/:id/open', requireAdmin, cycleController.openNow);
router.post('/:id/close', requireAdmin, cycleController.closeNow);
router.post('/:id/commit-now', requireAdmin, cycleController.commitNow);

// NEW: archive a cycle (safe)
router.patch('/:id/archive', requireAdmin, cycleController.archive);

// Delete a cycle
// - normal: blocks if allocations exist
// - force:  add ?force=1 to also delete allocations and detach pool projects
router.delete('/:id', requireAdmin, cycleController.remove);

module.exports = router;
