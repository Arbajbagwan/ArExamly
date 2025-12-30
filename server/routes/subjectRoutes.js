const express = require('express');
const router = express.Router();
const {
  getSubjects,
  getSubject,
  createSubject,
  updateSubject,
  deleteSubject,
  getSubjectQuestions
} = require('../controllers/subjectController');
const { protect } = require('../middleware/authMiddleware');
const { restrictTo } = require('../middleware/roleMiddleware');

// All routes require authentication
router.use(protect);
router.use(restrictTo('admin', 'superuser'));

router.route('/')
  .get(getSubjects)
  .post(createSubject);

router.route('/:id')
  .get(getSubject)
  .put(updateSubject)
  .delete(deleteSubject);

router.route('/:id/questions')
  .get(getSubjectQuestions);

module.exports = router;