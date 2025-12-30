const express = require('express');
const router = express.Router();
const {
  register,
  login,
  logout,
  getMe,
  changePassword,
  checkSession
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { restrictTo } = require('../middleware/roleMiddleware');

router.post('/register', protect, restrictTo('admin', 'superuser'), register);
router.post('/login', login);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.put('/change-password', protect, changePassword);
router.post('/check-session', protect, checkSession);

module.exports = router;