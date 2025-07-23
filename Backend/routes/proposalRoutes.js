const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const proposalController = require('../controllers/proposalController');
const verifyToken = require('../middleware/authMiddleware'); 

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Routes
router.post('/', verifyToken, upload.single('file'), proposalController.submitProposal);
router.get('/:studentId', verifyToken, proposalController.getProposalsByStudent);

module.exports = router;
