const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

//login
router.post('/', authController.loginUser);

module.exports = router;
