const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// Route to get student dashboard overview
router.get('/:studentId', dashboardController.getStudentDashboard);

module.exports = router;
