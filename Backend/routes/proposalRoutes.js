const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const proposalController = require('../controllers/proposalController');

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// POST route to submit a proposal
router.post('/', upload.single('file'), proposalController.submitProposal);

module.exports = router;
