// routes/supervisorRoutes.js
const express = require('express');
const router = express.Router();

// If your middleware is a default export (module.exports = fn)
const auth = require('../middleware/authMiddleware');
const verifyToken = auth?.verifyToken || auth; // supports default or named export

const supervisorController = require('../controllers/supervisorController');

// Sanity assertions (helpful during boot)
if (typeof verifyToken !== 'function') {
  throw new Error('verifyToken is not a function. Fix authMiddleware export/import.');
}
if (!supervisorController) {
  throw new Error('Failed to load supervisorController.');
}

// Routes
router.get('/', verifyToken, supervisorController.listSupervisors);
router.get('/proposals', verifyToken, supervisorController.getReceivedProposals);
router.patch('/proposals/:id/decision', verifyToken, supervisorController.decideProposal);

module.exports = router;
