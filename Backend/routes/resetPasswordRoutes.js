const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Route must include the token param
router.post('/:token', authController.resetPassword);

module.exports = router;

