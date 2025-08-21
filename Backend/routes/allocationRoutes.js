// Backend/routes/allocationRoutes.js
const express = require('express');
const router = express.Router();

const verifyToken   = require('../middleware/authMiddleware');
const requireAdmin  = require('../middleware/requireAdmin');
const afterDeadline = require('../middleware/afterDeadline');

const allocation = require('../controllers/allocationController');

// ---- helpers ----------------------------------------------------
const ensureNumericParam = (param) => (req, res, next) => {
  const v = req.params[param];
  if (!/^\d+$/.test(String(v || ''))) {
    return res.status(404).json({ message: 'Not found' });
  }
  next();
};

// Protect all routes
router.use(verifyToken);

/* ===================== READ ===================== */

// List allocations for the logged-in supervisor
//   GET /allocations/supervisor?cycle_id=1
router.get('/supervisor', allocation.listForSupervisor);

// (Optional fallback: keep GET /allocations working like before)
router.get('/', allocation.listForSupervisor);

// Allocation detail (must be AFTER the specific routes above)
router.get('/:allocation_id', ensureNumericParam('allocation_id'), allocation.getOne);

/* ===================== WRITE ===================== */

// Supervisor accepts a student-idea proposal into their pool
router.post('/accept-student-idea', allocation.acceptStudentIdea);

// Preview a run (no DB writes)
router.post('/preview', allocation.preview);

// Commit the run (DB writes; admin + after deadline)
router.post('/commit', requireAdmin, afterDeadline, allocation.commit);

// Manual allocate / deallocate
router.post('/', allocation.allocate);
router.delete('/:allocation_id', ensureNumericParam('allocation_id'), allocation.deallocate);

module.exports = router;
