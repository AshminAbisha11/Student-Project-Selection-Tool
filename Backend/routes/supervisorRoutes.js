// routes/supervisorRoutes.js
const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const supervisorController = require('../controllers/supervisorController');

router.get('/', verifyToken, supervisorController.listSupervisors);
router.get('/proposals', verifyToken, supervisorController.getReceivedProposals);

router.patch('/proposals/:id/decision', verifyToken, supervisorController.decideProposal);
module.exports = router;
