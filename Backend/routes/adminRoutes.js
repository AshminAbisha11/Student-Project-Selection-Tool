// routes/adminRoutes.js
const express = require('express');
const router = express.Router();

const admin = require('../controllers/adminController');

// OPTIONAL but recommended:
const verifyToken = require('../middleware/authMiddleware');
const requireAdmin = require('../middleware/requireAdmin');

// Protect everything under /admin
router.use(verifyToken, requireAdmin);

router.post('/invites', admin.createInvite);
router.get('/invites', admin.listInvites);
router.post('/invites/:invite_id/revoke', admin.revokeInvite);

module.exports = router;
