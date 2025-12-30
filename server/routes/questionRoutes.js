const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const {
  getQuestions,
  getQuestion,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  bulkCreateQuestions,
  getQuestionStats
} = require('../controllers/questionController');
const { protect } = require('../middleware/authMiddleware');
const { restrictTo } = require('../middleware/roleMiddleware');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, `questions-${Date.now()}${path.extname(file.originalname)}`);
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
  .get(getQuestions)
  .post(createQuestion);

router.route('/stats')
  .get(getQuestionStats);

router.route('/bulk-upload')
  .post(upload.single('file'), bulkCreateQuestions);

router.route('/:id')
  .get(getQuestion)
  .put(updateQuestion)
  .delete(deleteQuestion);

module.exports = router;