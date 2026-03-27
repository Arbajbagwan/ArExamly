const Question = require('../models/Question');
const Subject = require('../models/Subject');
const Passage = require('../models/Passage');
const { parseQuestionsExcel } = require('../utils/excelParser');
const { createJob, updateJob, getJob, canAccessJob } = require('../utils/uploadJobStore');
const fs = require('fs').promises;

const applyQuestionOwnerFilter = (req, filter = {}) => {
  if (req.user.role === 'superuser') {
    return { ...filter, createdBy: req.user._id };
  }
  return filter;
};

// @desc    Get all questions
// @route   GET /api/questions
// @access  Private (SuperUser)
exports.getQuestions = async (req, res, next) => {
  try {
    const { type, subject, difficulty, topic, search, status } = req.query;

    let filter = applyQuestionOwnerFilter(req, {});

    if (!status || status === 'active') {
      filter.isActive = true;
    } else if (status === 'inactive') {
      filter.isActive = false;
    }

    // Apply filters
    if (type) filter.type = type;
    if (subject) filter.subject = subject;
    if (difficulty) filter.difficulty = difficulty;
    if (topic) filter.topic = { $regex: topic, $options: 'i' };
    if (search) {
      filter.$or = [
        { question: { $regex: search, $options: 'i' } },
        { 'passage.title': { $regex: search, $options: 'i' } },
        { 'passage.text': { $regex: search, $options: 'i' } },
        { 'passage.topic': { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const questions = await Question.find(filter)
      .select('type question options correctOption credit subject topic difficulty explanation subQuestions passageRef isActive createdAt')
      .populate('subject', 'name code color')
      .populate('passageRef', 'title topic complexity marksLabel')
      .sort('createdAt')
      .lean();

    res.status(200).json({
      success: true,
      count: questions.length,
      questions
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single question
// @route   GET /api/questions/:id
// @access  Private (SuperUser)
exports.getQuestion = async (req, res, next) => {
  try {
    const question = await Question.findOne(
      applyQuestionOwnerFilter(req, { _id: req.params.id })
    )
      .populate('subject', 'name code color')
      .populate('passageRef', 'title text topic complexity marksLabel')
      .populate('createdBy', 'firstname lastname username');

    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    res.status(200).json({
      success: true,
      question
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create question
// @route   POST /api/questions
// @access  Private (SuperUser)
exports.createQuestion = async (req, res, next) => {
  try {
    const {
      type,
      question,
      options,
      correctOption,
      credit,
      subject,
      topic,
      difficulty,
      tags,
      explanation,
      passage,
      subQuestions
    } = req.body;

    // Validate subject exists
    const subjectExists = await Subject.findById(subject);
    if (!subjectExists) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subject selected'
      });
    }

    const questionData = {
      type,
      question,
      credit: Number(credit),
      subject,
      topic: topic || 'General',
      difficulty: difficulty || 'medium',
      tags: tags || [],
      explanation,
      createdBy: req.user._id
    };

    if (passage?.text?.trim()) {
      questionData.passage = {
        title: passage.title?.trim() || '',
        text: passage.text.trim(),
        topic: passage.topic?.trim() || '',
        complexity: passage.complexity || 'simple',
        marksLabel: passage.marksLabel?.trim() || ''
      };
    }
    if (req.body.passageRef) {
      const passageDoc = await Passage.findOne({
        _id: req.body.passageRef,
        ...(req.user.role === 'superuser' ? { createdBy: req.user._id } : {}),
        isActive: true
      });
      if (!passageDoc) {
        return res.status(400).json({ success: false, message: 'Invalid passage selected' });
      }
      questionData.passageRef = req.body.passageRef;
      delete questionData.passage;
    }

    // Add MCQ specific fields
    if (type === 'mcq') {
      questionData.options = options;
      questionData.correctOption = Number(correctOption);
    }
    if (type === 'passage') {
      if (!Array.isArray(subQuestions) || subQuestions.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Passage question must include sub questions'
        });
      }
      questionData.subQuestions = subQuestions.map((sq) => ({
        prompt: sq.prompt,
        type: sq.type,
        options: sq.type === 'mcq' ? (sq.options || []) : [],
        correctOption: sq.type === 'mcq' ? Number(sq.correctOption) : undefined,
        credit: Number(sq.credit || 0)
      }));
      questionData.credit = questionData.subQuestions.reduce((sum, sq) => sum + (sq.credit || 0), 0);
    }

    const newQuestion = await Question.create(questionData);

    // Populate subject for response
    await newQuestion.populate('subject', 'name code color');
    await newQuestion.populate('passageRef', 'title topic complexity marksLabel');

    res.status(201).json({
      success: true,
      message: 'Question created successfully',
      question: newQuestion
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update question
// @route   PUT /api/questions/:id
// @access  Private (SuperUser)
exports.updateQuestion = async (req, res, next) => {
  try {
    let question = await Question.findOne(
      applyQuestionOwnerFilter(req, { _id: req.params.id })
    );

    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    // Don't allow changing type after creation
    // if (req.body.type && req.body.type !== question.type) {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Cannot change question type after creation'
    //   });
    // }

    // Validate subject if being updated
    if (req.body.subject) {
      const subjectExists = await Subject.findById(req.body.subject);
      if (!subjectExists) {
        return res.status(400).json({
          success: false,
          message: 'Invalid subject selected'
        });
      }
    }

    const updateData = { ...req.body };

    if (req.body.passage) {
      if (req.body.passage.text?.trim()) {
        updateData.passage = {
          title: req.body.passage.title?.trim() || '',
          text: req.body.passage.text.trim(),
          topic: req.body.passage.topic?.trim() || '',
          complexity: req.body.passage.complexity || 'simple',
          marksLabel: req.body.passage.marksLabel?.trim() || ''
        };
      } else {
        updateData.passage = undefined;
      }
    }
    if (req.body.passageRef !== undefined) {
      if (req.body.passageRef) {
        const passageDoc = await Passage.findOne({
          _id: req.body.passageRef,
          ...(req.user.role === 'superuser' ? { createdBy: req.user._id } : {}),
          isActive: true
        });
        if (!passageDoc) {
          return res.status(400).json({ success: false, message: 'Invalid passage selected' });
        }
      }
      updateData.passageRef = req.body.passageRef || null;
      if (updateData.passageRef) delete updateData.passage;
    }
    if (req.body.type === 'passage' || req.body.subQuestions) {
      if (!Array.isArray(req.body.subQuestions) || req.body.subQuestions.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Passage question must include sub questions'
        });
      }
      updateData.subQuestions = req.body.subQuestions.map((sq) => ({
        prompt: sq.prompt,
        type: sq.type,
        options: sq.type === 'mcq' ? (sq.options || []) : [],
        correctOption: sq.type === 'mcq' ? Number(sq.correctOption) : undefined,
        credit: Number(sq.credit || 0)
      }));
      updateData.credit = updateData.subQuestions.reduce((sum, sq) => sum + (sq.credit || 0), 0);
    }

    question = await Question.findOneAndUpdate(
      applyQuestionOwnerFilter(req, { _id: req.params.id }),
      updateData,
      { new: true, runValidators: true }
    ).populate('subject', 'name code color')
      .populate('passageRef', 'title topic complexity marksLabel');

    res.status(200).json({
      success: true,
      message: 'Question updated successfully',
      question
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete question
// @route   DELETE /api/questions/:id
// @access  Private (SuperUser)
exports.deleteQuestion = async (req, res, next) => {
  try {
    const question = await Question.findOne(
      applyQuestionOwnerFilter(req, { _id: req.params.id })
    );

    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    // Soft delete
    question.isActive = false;
    await question.save();

    res.status(200).json({
      success: true,
      message: 'Question deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Bulk deactivate questions
// @route   POST /api/questions/bulk-delete
// @access  Private (Admin/SuperUser)
exports.bulkDeleteQuestions = async (req, res, next) => {
  try {
    const { questionIds } = req.body;

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No questions selected'
      });
    }

    const filter = applyQuestionOwnerFilter(req, { _id: { $in: questionIds } });
    const result = await Question.updateMany(filter, { $set: { isActive: false } });

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} questions deactivated`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Bulk activate questions
// @route   POST /api/questions/bulk-activate
// @access  Private (Admin/SuperUser)
exports.bulkActivateQuestions = async (req, res, next) => {
  try {
    const { questionIds } = req.body;

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No questions selected'
      });
    }

    const filter = applyQuestionOwnerFilter(req, { _id: { $in: questionIds } });
    const result = await Question.updateMany(filter, { $set: { isActive: true } });

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} questions activated`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    next(error);
  }
};

const processQuestionBulkUpload = async ({ filePath, subjectId, userId }) => {
  const parseResult = parseQuestionsExcel(filePath);
  if (!parseResult.success) {
    return {
      success: false,
      message: 'Excel validation failed',
      errors: parseResult.errors || []
    };
  }

  const createdQuestions = [];
  const failedQuestions = [];

  for (const questionData of parseResult.data) {
    try {
      const question = await Question.create({
        ...questionData,
        subject: subjectId,
        createdBy: userId
      });
      createdQuestions.push({
        id: question._id,
        question: `${String(question.question || '').substring(0, 50)}...`
      });
    } catch (error) {
      failedQuestions.push({
        question: `${String(questionData.question || '').substring(0, 50)}...`,
        error: error.message
      });
    }
  }

  return {
    success: true,
    message: `Successfully created ${createdQuestions.length} questions`,
    created: createdQuestions.length,
    skipped: failedQuestions.length,
    total: parseResult.data.length,
    createdQuestions,
    failedQuestions
  };
};

// @desc    Queue bulk create questions from Excel
// @route   POST /api/questions/bulk-upload
// @access  Private (SuperUser)
exports.startBulkCreateQuestions = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload an Excel file'
      });
    }

    const { subjectId } = req.body;
    if (!subjectId) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({
        success: false,
        message: 'Please select a subject for bulk upload'
      });
    }

    const subject = await Subject.findOne({
      _id: subjectId,
      ...(req.user.role === 'superuser' ? { createdBy: req.user._id } : {})
    });
    if (!subject) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({
        success: false,
        message: 'Invalid subject selected'
      });
    }

    const jobId = createJob({ type: 'questions', ownerId: req.user._id });
    updateJob(jobId, { status: 'processing' });

    const filePath = req.file.path;
    const userId = req.user._id;

    setImmediate(async () => {
      try {
        const result = await processQuestionBulkUpload({ filePath, subjectId, userId });
        updateJob(jobId, {
          status: result.success ? 'completed' : 'failed',
          result,
          error: result.success ? null : result.message
        });
      } catch (error) {
        updateJob(jobId, {
          status: 'failed',
          error: error.message,
          result: {
            success: false,
            message: error.message || 'Server error during upload'
          }
        });
      } finally {
        await fs.unlink(filePath).catch(() => {});
      }
    });

    return res.status(202).json({
      success: true,
      message: 'Upload accepted. Processing in background.',
      jobId,
      status: 'processing'
    });
  } catch (error) {
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    next(error);
  }
};

// @desc    Get bulk upload job status
// @route   GET /api/questions/bulk-upload/:jobId
// @access  Private (Admin/SuperUser)
exports.getBulkCreateQuestionsStatus = async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, message: 'Job not found' });
  }

  if (!canAccessJob(job, req.user)) {
    return res.status(403).json({ success: false, message: 'Not authorized to access this job' });
  }

  return res.status(200).json({
    success: true,
    jobId: job.id,
    type: job.type,
    status: job.status,
    result: job.result,
    error: job.error
  });
};

// @desc    Get question stats
// @route   GET /api/questions/stats
// @access  Private (SuperUser)
exports.getQuestionStats = async (req, res, next) => {
  try {
    const stats = await Question.aggregate([
      {
        $match: applyQuestionOwnerFilter(req, { isActive: true })
      },
      {
        $group: {
          _id: '$subject',
          total: { $sum: 1 },
          mcq: { $sum: { $cond: [{ $eq: ['$type', 'mcq'] }, 1, 0] } },
          theory: { $sum: { $cond: [{ $eq: ['$type', 'theory'] }, 1, 0] } },
          easy: { $sum: { $cond: [{ $eq: ['$difficulty', 'easy'] }, 1, 0] } },
          medium: { $sum: { $cond: [{ $eq: ['$difficulty', 'medium'] }, 1, 0] } },
          hard: { $sum: { $cond: [{ $eq: ['$difficulty', 'hard'] }, 1, 0] } }
        }
      },
      {
        $lookup: {
          from: 'subjects',
          localField: '_id',
          foreignField: '_id',
          as: 'subject'
        }
      },
      { $unwind: '$subject' },
      {
        $project: {
          subject: '$subject.name',
          subjectCode: '$subject.code',
          subjectColor: '$subject.color',
          total: 1,
          mcq: 1,
          theory: 1,
          easy: 1,
          medium: 1,
          hard: 1
        }
      }
    ]);

    res.status(200).json({
      success: true,
      stats
    });
  } catch (error) {
    next(error);
  }
};
