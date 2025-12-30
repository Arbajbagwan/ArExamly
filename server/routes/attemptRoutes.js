const express = require('express');
const router = express.Router();
const {
  startExam,
  saveAnswer,
  submitExam,
  getExamAttempts,
  getMyAttempts,
  evaluateTheoryAnswers,
  downloadAttemptPDF
} = require('../controllers/attemptController');
const { protect } = require('../middleware/authMiddleware');
const { restrictTo } = require('../middleware/roleMiddleware');

router.use(protect);

router.route('/my')
  .get(restrictTo('examinee'), getMyAttempts);

router.route('/exam/:examId')
  .get(restrictTo('admin', 'superuser'), getExamAttempts);

router.route('/:examId/start')
  .post(restrictTo('examinee'), startExam);

router.route('/:attemptId/answer')
  .put(restrictTo('examinee'), saveAnswer);

router.route('/:attemptId/submit')
  .post(restrictTo('examinee'), submitExam);

router.route('/:attemptId/evaluate')
  .put(restrictTo('admin', 'superuser'), evaluateTheoryAnswers);

router.get('/:attemptId/pdf',restrictTo('admin', 'superuser'),downloadAttemptPDF
);

module.exports = router;