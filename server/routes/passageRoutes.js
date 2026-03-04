const express = require('express');
const router = express.Router();
const { getPassages, createPassage } = require('../controllers/passageController');
const { protect } = require('../middleware/authMiddleware');
const { restrictTo } = require('../middleware/roleMiddleware');

router.use(protect);
router.use(restrictTo('admin', 'superuser'));

router.route('/')
  .get(getPassages)
  .post(createPassage);

module.exports = router;
