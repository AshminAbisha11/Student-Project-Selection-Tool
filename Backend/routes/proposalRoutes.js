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
  if (!file) return cb(null, true); // allow no file
  if (allowedMimes.includes(file.mimetype)) return cb(null, true);
  return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// --- Multer error -> 400 ---
function multerErrorHandler(err, _req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File too large (max 10MB).' });
    }
    return res.status(400).json({ message: 'Invalid file upload.' });
  }
  return next(err);
}

// --- helper: ensure numeric param ---
function ensureNumericParam(paramName) {
  return (req, res, next) => {
    const v = req.params[paramName];
    if (!/^\d+$/.test(String(v || ''))) return res.status(404).end();
    next();
  };
}

/* ======================
   Routes (ORDER MATTERS)
   ====================== */

// For the student proposal form dropdown
// -> /proposals/supervisors/accepting-ideas
router.get('/supervisors/accepting-ideas', proposalController.listAcceptingSupervisors);

// Create a proposal (student-auth). multipart/form-data with "file"
router.post(
  '/',
  verifyToken,
  upload.single('file'),
  multerErrorHandler,
  proposalController.submitProposal
);

// Get my proposals (student-auth, controller uses req.user)
router.get('/', verifyToken, proposalController.getProposalsByStudent);

// (Optional/admin) Get proposals for a specific student (numeric only)
// Keep this LAST so it won't swallow the routes above.
router.get('/:studentId', ensureNumericParam('studentId'), verifyToken, proposalController.getProposalsByStudent);

module.exports = router;
