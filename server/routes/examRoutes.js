const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  getExams,
  getExam,
  createExam,
  updateExam,
  deleteExam,
  assignQuestions,
  assignExaminees,
  generateRandomQuestions
} = require('../controllers/examController');
const { protect } = require('../middleware/authMiddleware');
const { restrictTo } = require('../middleware/roleMiddleware');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, `exam-instruction-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.pdf') {
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  }
});

router.use(protect);

router.route('/')
  .get(getExams)
  .post(restrictTo('admin', 'superuser'), upload.single('instructionPdfFile'), createExam);

router.route('/:id')
  .get(getExam)
  .put(restrictTo('admin', 'superuser'), upload.single('instructionPdfFile'), updateExam)
  .delete(restrictTo('admin', 'superuser'), deleteExam);

router.route('/:id/questions')
  .post(restrictTo('admin', 'superuser'), assignQuestions);

router.post('/:id/generate-questions', restrictTo('admin', 'superuser'), generateRandomQuestions);

router.route('/:id/assign')
  .post(restrictTo('admin', 'superuser'), assignExaminees);

module.exports = router;
