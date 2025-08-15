// routes/proposalRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const verifyToken = require('../middleware/authMiddleware');
const proposalController = require('../controllers/proposalController');

// --- ensure uploads dir exists ---
const uploadDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// --- Multer setup ---
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const allowedMimes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const fileFilter = (_req, file, cb) => {
  if (!file) return cb(null, true);
  if (allowedMimes.includes(file.mimetype)) return cb(null, true);
  cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// --- Routes ---
// Create proposal (student_id taken from JWT in controller)
router.post('/', verifyToken, upload.single('file'), proposalController.submitProposal);

// Get my proposals (no param needed)
router.get('/', verifyToken, proposalController.getProposalsByStudent); // controller uses req.user

// Get proposals for a specific student (only admin should use; controller enforces)
router.get('/:studentId', verifyToken, proposalController.getProposalsByStudent);

module.exports = router;
