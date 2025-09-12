const express = require('express');
const router = express.Router();
const preferenceController = require('../controllers/preferenceController');
const verifyToken = require('../middleware/authMiddleware');
const submissionWindow = require('../middleware/submissionWindow'); 

router.use(verifyToken);

router.get('/', preferenceController.getPreferencesByStudent);

router.get(['/submission', '/submitted'], preferenceController.getSubmissionStatus);

router.post('/', submissionWindow, preferenceController.addPreference);
router.put('/', submissionWindow, preferenceController.updatePreferenceOrder);
router.patch('/contacted', submissionWindow, preferenceController.updateContactedSupervisor);
router.delete('/:preferenceId', submissionWindow, preferenceController.deletePreference);

router.post('/submit', submissionWindow, preferenceController.submitPreferences);

module.exports = router;
