const router = require('express').Router();
const verifyToken = require('../middleware/authMiddleware');
const userCtrl = require('../controllers/userController');

router.get('/me', verifyToken, userCtrl.getMe);
router.put('/me', verifyToken, userCtrl.updateMe);

module.exports = router;
