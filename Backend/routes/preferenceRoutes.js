const express = require('express');
const router = express.Router();
const preferenceController = require('../controllers/preferenceController');
const verifyToken = require('../middleware/authMiddleware');

router.use(verifyToken);

// GET all preferences for a student
router.get('/', preferenceController.getPreferencesByStudent);

// POST a new preference
router.post('/', preferenceController.addPreference);

// PUT to update preference order
router.put('/', preferenceController.updatePreferenceOrder);

// DELETE a preference
router.delete('/:preferenceId', preferenceController.deletePreference);

module.exports = router;
