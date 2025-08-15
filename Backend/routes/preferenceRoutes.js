const express = require('express');
const router = express.Router();
const preferenceController = require('../controllers/preferenceController');
const verifyToken = require('../middleware/authMiddleware');
const submissionWindow = require('../middleware/submissionWindow'); // blocks after deadline

router.use(verifyToken);

// ===== Read (always allowed) =====
router.get('/', preferenceController.getPreferencesByStudent);

// ===== Writes (blocked after deadline) =====
router.post('/', submissionWindow, preferenceController.addPreference);
router.put('/', submissionWindow, preferenceController.updatePreferenceOrder);
router.patch('/contacted', submissionWindow, preferenceController.updateContactedSupervisor);
router.delete('/:preferenceId', submissionWindow, preferenceController.deletePreference);

// ===== Final submission =====
// This should still be allowed until deadline, then locked by submissionWindow
router.post('/submit', submissionWindow, preferenceController.submitPreferences);

module.exports = router;
