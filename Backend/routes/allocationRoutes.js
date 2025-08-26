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

// protect everything below
router.use(verifyToken);

/* ===================== READ ===================== */

// Student: get my latest allocation (if any)
// GET /allocations/me
router.get('/me', allocation.myAllocationForStudent);

// Supervisor: list my allocations (optionally filter by ?cycle_id=)
// GET /allocations/supervisor?cycle_id=1
router.get('/supervisor', allocation.listForSupervisor);

// Back-compat (optional): GET /allocations -> same as /allocations/supervisor
router.get('/', allocation.listForSupervisor);

// Allocation detail (supervisor can fetch their own row)
// GET /allocations/:allocation_id
router.get('/:allocation_id', ensureNumericParam('allocation_id'), allocation.getOne);

/* ===================== WRITE ===================== */

// Supervisor accepts a student-idea proposal into their pool
// POST /allocations/accept-student-idea
router.post('/accept-student-idea', allocation.acceptStudentIdea);

// Preview a run (no DB writes) – leave open to any authenticated user,
// or swap to `requireAdmin` if you want to restrict it.
// POST /allocations/preview
router.post('/preview', allocation.preview);

// Commit the run (DB writes; admin only; after deadline)
// POST /allocations/commit
router.post('/commit', requireAdmin, afterDeadline, allocation.commit);

// Manual allocate / deallocate
// POST /allocations
router.post('/', allocation.allocate);

// DELETE /allocations/:allocation_id
router.delete('/:allocation_id', ensureNumericParam('allocation_id'), allocation.deallocate);

module.exports = router;
