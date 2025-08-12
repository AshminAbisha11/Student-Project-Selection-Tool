const express = require('express');
const router = express.Router();
const preferenceController = require('../controllers/preferenceController');
const verifyToken = require('../middleware/authMiddleware');
const submissionWindow = require('../middleware/submissionWindow'); // ⬅️ NEW

router.use(verifyToken);

// ----- Read (allowed always) -----
router.get('/', preferenceController.getPreferencesByStudent);

// ----- Writes (blocked after deadline by submissionWindow) -----
router.post('/', submissionWindow, preferenceController.addPreference);
router.put('/', submissionWindow, preferenceController.updatePreferenceOrder);
router.patch('/contacted', submissionWindow, preferenceController.updateContactedSupervisor);
router.delete('/:preferenceId', submissionWindow, preferenceController.deletePreference);

module.exports = router;
