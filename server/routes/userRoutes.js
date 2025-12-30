const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const {
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  bulkCreateExaminees,
  resetPassword,
  bulkDeleteUsers,
  bulkActivateUsers
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const { restrictTo } = require('../middleware/roleMiddleware');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, `examinees-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    if (ext !== '.xlsx' && ext !== '.xls') {
      return cb(new Error('Only Excel files are allowed'));
    }
    cb(null, true);
  }
});

router.use(protect);
router.use(restrictTo('admin', 'superuser'));

router.route('/')
  .get(getUsers);

router.route('/bulk-upload')
  .post(upload.single('file'), bulkCreateExaminees);

router.post('/bulk-delete',
  protect,
  restrictTo('admin', 'superuser'),
  bulkDeleteUsers
);

router.post('/bulk-activate',
  protect,
  restrictTo('admin', 'superuser'),
  bulkActivateUsers
);

router.route('/:id')
  .get(getUser)
  .put(updateUser)
  .delete(deleteUser);

router.route('/:id/reset-password')
  .put(resetPassword);

module.exports = router;