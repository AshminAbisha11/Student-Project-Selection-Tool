// src/routes/allocationRoutes.js
const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const allocation = require('../controllers/allocationController');

router.post('/', verifyToken, allocation.allocate);                
router.delete('/:allocation_id', verifyToken, allocation.deallocate); 

module.exports = router;
