const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// POST /admin-login
router.post('/', authController.adminLogin);

module.exports = router;
