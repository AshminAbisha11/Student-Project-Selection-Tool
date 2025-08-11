// routes/supervisorRoutes.js
const router = require('express').Router();
const verifyToken = require('../middleware/authMiddleware');
const supervisorController = require('../controllers/supervisorDashboardController');

// GET /supervisor/overview
router.get('/overview', verifyToken, supervisorController.getOverview);

module.exports = router;
