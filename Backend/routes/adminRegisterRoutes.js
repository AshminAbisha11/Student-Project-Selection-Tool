const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Admin sign-up (public)
router.post('/', authController.adminSignup);

module.exports = router;
