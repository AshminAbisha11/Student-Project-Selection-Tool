const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const { listSupervisors } = require('../controllers/supervisorController');

router.get('/', verifyToken, listSupervisors);

module.exports = router;
