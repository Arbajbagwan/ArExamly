const express = require('express');
const router = express.Router();
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

router.use(protect);

router.route('/')
  .get(getExams)
  .post(restrictTo('admin', 'superuser'), createExam);

router.route('/:id')
  .get(getExam)
  .put(restrictTo('admin', 'superuser'), updateExam)
  .delete(restrictTo('admin', 'superuser'), deleteExam);

router.route('/:id/questions')
  .post(restrictTo('admin', 'superuser'), assignQuestions);

router.post('/:id/generate-questions', restrictTo('admin', 'superuser'), generateRandomQuestions);

router.route('/:id/assign')
  .post(restrictTo('admin', 'superuser'), assignExaminees);

module.exports = router;