const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

//register
router.post('/' , authController.registerUser);

module.exports = router;
