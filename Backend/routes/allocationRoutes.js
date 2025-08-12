// Backend/routes/allocationRoutes.js
const express = require('express');
const router = express.Router();

const verifyToken   = require('../middleware/authMiddleware');
const requireAdmin  = require('../middleware/requireAdmin');   // ⬅️ NEW
const afterDeadline = require('../middleware/afterDeadline');  // ⬅️ NEW

const allocation = require('../controllers/allocationController');

// Protect everything under /allocations
router.use(verifyToken);

// Preview (no DB writes) — allow any authenticated user (or add requireAdmin if you prefer)
router.post('/preview', allocation.preview);

// Commit (writes to DB) — must be admin AND after the deadline
router.post('/commit', requireAdmin, afterDeadline, allocation.commit);

// Manual admin ops (kept)
router.post('/', allocation.allocate);
router.delete('/:allocation_id', allocation.deallocate);

module.exports = router;
