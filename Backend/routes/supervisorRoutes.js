// routes/supervisorRoutes.js
const express = require('express');
const router = express.Router();

// Auth middleware: supports either default or named export
const auth = require('../middleware/authMiddleware');
const verifyToken = auth?.verifyToken || auth;

const supervisorController = require('../controllers/supervisorController');

// ---- Sanity checks on boot ----
if (typeof verifyToken !== 'function') {
  throw new Error('verifyToken is not a function. Fix authMiddleware export/import.');
}
if (!supervisorController) {
  throw new Error('Failed to load supervisorController.');
}

// Apply auth to all supervisor routes
router.use(verifyToken);

// ---- Dashboard tiles ----
router.get('/overview', supervisorController.getOverview);

// ---- My Projects list (supports ?tab=active|draft|archived & ?q=search) ----
router.get('/projects', supervisorController.getMyProjects);

// ---- Directory of supervisors (optional) ----
router.get('/', supervisorController.listSupervisors);

// ---- Proposals ----
router.get('/proposals', supervisorController.getReceivedProposals);
router.patch('/proposals/:id/decision', supervisorController.decideProposal);

module.exports = router;
