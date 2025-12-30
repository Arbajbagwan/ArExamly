const Exam = require('../models/Exam');
const Question = require('../models/Question');
const User = require('../models/User');
const syncExamStatus = require('../utils/syncExamStatus');
const ExamAttempt = require('../models/ExamAttempt');

// @desc    Get all exams
// @route   GET /api/exams
// @access  Private
exports.getExams = async (req, res, next) => {
  try {
    let filter = { isActive: true };

    // Examinees only see exams assigned to them
    if (req.user.role === 'examinee') {
      filter.assignedTo = req.user._id;
      filter.status = { $in: ['scheduled', 'active', 'completed'] };
    }

    // SuperUsers only see their own exams
    if (req.user.role === 'superuser') {
      filter.createdBy = req.user._id;
    }

    const exams = await Exam.find(filter)
      .populate('createdBy', 'firstname lastname')
      .populate({
        path: 'questions.question',
        select: 'type credit',
        options: { lean: true }
      })
      .sort('-createdAt');

    const result = [];

    for (const exam of exams) {
      await syncExamStatus(exam);

      let attempt = null;

      if (req.user.role === 'examinee') {
        attempt = await ExamAttempt.findOne({
          exam: exam._id,
          examinee: req.user._id
        }).select('status');
      }

      result.push({
        ...exam.toObject(),
        myAttemptStatus: attempt?.status || null
      });
    }

    res.status(200).json({
      success: true,
      count: result.length,
      exams: result
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single exam
// @route   GET /api/exams/:id
// @access  Private
exports.getExam = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('createdBy', 'firstname lastname')
      .populate('questions.question')
      .populate('assignedTo', 'firstname lastname username');

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    // Authorization check for examinees
    if (req.user.role === 'examinee') {
      const isAssigned = exam.assignedTo.some(
        user => user._id.toString() === req.user._id.toString()
      );

      if (!isAssigned) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access this exam'
        });
      }

      // For examinees, don't send correct answers
      if (exam.questions && exam.questions.length > 0) {
        exam.questions = exam.questions.map(q => {
          if (q.question) {
            const question = q.question.toObject();
            if (question.type === 'mcq') {
              delete question.correctOption;
            }
            return { ...q.toObject(), question };
          }
          return q;
        });
      }
    }

    res.status(200).json({
      success: true,
      exam
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create exam
// @route   POST /api/exams
// @access  Private (SuperUser)
exports.createExam = async (req, res, next) => {
  try {
    const {
      title,
      description,
      duration,
      scheduledDate,
      startTime,
      endTime,
      instructions,
      passingMarks
    } = req.body;

    // Validate required fields
    if (!title || !duration || !scheduledDate || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }

    // Create exam data
    const examData = {
      title,
      description,
      duration: Number(duration),
      scheduledDate: new Date(scheduledDate),
      startTime,
      endTime,
      instructions,
      passingMarks: passingMarks || 0,
      createdBy: req.user._id,
      status: 'draft'
    };

    const exam = await Exam.create(examData);

    res.status(201).json({
      success: true,
      message: 'Exam created successfully',
      exam
    });
  } catch (error) {
    console.error('Create Exam Error:', error);
    next(error);
  }
};

// @desc    Update exam
// @route   PUT /api/exams/:id
// @access  Private (SuperUser)
exports.updateExam = async (req, res, next) => {
  try {
    let exam = await Exam.findById(req.params.id);

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    // Check ownership for superuser
    if (req.user.role === 'superuser' && exam.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this exam'
      });
    }

    // Don't allow editing active or completed exams
    if (['active', 'completed'].includes(exam.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit active or completed exams'
      });
    }

    // Prepare update data
    const updateData = { ...req.body };

    // Convert duration to number if provided
    if (updateData.duration) {
      updateData.duration = Number(updateData.duration);
    }

    // Convert scheduledDate to Date if provided
    if (updateData.scheduledDate) {
      updateData.scheduledDate = new Date(updateData.scheduledDate);
    }

    exam = await Exam.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true
      }
    );

    // Recalculate total marks if questions were updated
    if (req.body.questions) {
      await exam.calculateTotalMarks();
      await exam.save();
    }

    // --- INVALIDATE REDIS CACHE ---
    if (global.redis && global.redis.status === 'ready') {
      const cacheKey = `exam:${req.params.id}:data`;
      try {
        await global.redis.del(cacheKey);
        console.log('Cache invalidated for:', cacheKey);
      } catch (err) {
        console.error('Redis delete failed, skipping...');
      }
    }

    res.status(200).json({
      success: true,
      message: 'Exam updated successfully',
      exam
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete exam
// @route   DELETE /api/exams/:id
// @access  Private (SuperUser)
exports.deleteExam = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.id);

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    // Check ownership for superuser
    if (req.user.role === 'superuser' && exam.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this exam'
      });
    }

    // Don't allow deleting active exams
    if (exam.status === 'active') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete active exams'
      });
    }

    // Soft delete
    exam.isActive = false;
    exam.status = 'cancelled';
    await exam.save();

    res.status(200).json({
      success: true,
      message: 'Exam deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Assign questions to exam
// @route   POST /api/exams/:id/questions
// @access  Private (SuperUser)
exports.assignQuestions = async (req, res, next) => {
  try {
    const { questionIds } = req.body;

    if (!questionIds || !Array.isArray(questionIds)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide question IDs'
      });
    }

    const exam = await Exam.findById(req.params.id);

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    // Verify all questions exist
    const questions = await Question.find({
      _id: { $in: questionIds },
      isActive: true
    });

    if (questions.length !== questionIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some questions not found or inactive'
      });
    }

    // Assign questions with order
    exam.questions = questionIds.map((qId, index) => ({
      question: qId,
      order: index
    }));

    // 🔥 FORCE CUSTOM MODE
    exam.selectionMode = 'manual';

    // 🔥 REMOVE RANDOM MODE COMPLETELY
    exam.randomConfig = null;
    exam.markModified('randomConfig');

    await exam.calculateTotalMarks();
    await exam.save();

    res.status(200).json({
      success: true,
      message: 'Questions assigned successfully',
      exam
    });
  } catch (error) {
    next(error);
  }
};

exports.generateRandomQuestions = async (req, res, next) => {
  try {
    const examId = req.params.id;
    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    if (exam.status === 'active' || exam.status === 'completed') {
      return res.status(400).json({
        message: 'Cannot change questions after exam has started'
      });
    }

    if (exam.questions.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Custom questions exist. Remove them before enabling random mode.'
      });
    }

    const {
      totalQuestions,
      mcqCount = 0,
      theoryCount = 0,
      subjectIds = [],
      difficulty,
      topic,
      shuffleSelectedQuestions = true
    } = req.body;

    // 1. SET THE MODE TO RANDOM
    exam.selectionMode = 'random'; // or 'random-per-user' depending on your schema enum

    // 2. SAVE ONLY THE RULES
    exam.randomConfig = {
      totalQuestions: Number(totalQuestions),
      mcqCount: Number(mcqCount),
      theoryCount: Number(theoryCount),
      subjectIds,
      difficulty,
      topic,
      shuffleSelectedQuestions
    };

    // 3. IMPORTANT: Clear the fixed questions array
    // This is why you see "already selected" questions. We must empty this.
    exam.questions = [];
    exam.markModified('questions');

    await exam.save();

    // 4. Invalidate Cache
    if (global.redis && global.redis.status === 'ready') {
      await global.redis.del(`exam:${examId}:data`);
    }

    return res.status(200).json({
      success: true,
      message: 'Random rules saved! Questions will be picked uniquely when each student starts.',
      exam
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Assign examinees to exam
// @route   POST /api/exams/:id/assign
// @access  Private (SuperUser)
exports.assignExaminees = async (req, res, next) => {
  try {
    const { examineeIds } = req.body;

    if (!examineeIds || !Array.isArray(examineeIds)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide examinee IDs'
      });
    }

    const exam = await Exam.findById(req.params.id);

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    // Verify all examinees exist
    const examinees = await User.find({
      _id: { $in: examineeIds },
      role: 'examinee',
      isActive: true
    });

    if (examinees.length !== examineeIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some examinees not found or inactive'
      });
    }

    exam.assignedTo = examineeIds;

    // Update status to scheduled if it was draft
    if (exam.status === 'draft') {
      exam.status = 'scheduled';
    }

    await exam.save();

    res.status(200).json({
      success: true,
      message: 'Examinees assigned successfully',
      exam
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update exam status
// @route   PUT /api/exams/:id/status
// @access  Private (SuperUser)
exports.updateExamStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!['draft', 'scheduled', 'active', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const exam = await Exam.findById(req.params.id);

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    exam.status = status;
    await exam.save();

    res.status(200).json({
      success: true,
      message: 'Exam status updated successfully',
      exam
    });
  } catch (error) {
    next(error);
  }
};