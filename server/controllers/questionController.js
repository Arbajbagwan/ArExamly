const Question = require('../models/Question');
const Subject = require('../models/Subject');
const { parseQuestionsExcel } = require('../utils/excelParser');
const fs = require('fs').promises;

// @desc    Get all questions
// @route   GET /api/questions
// @access  Private (SuperUser)
exports.getQuestions = async (req, res, next) => {
  try {
    const { type, subject, difficulty, topic, search } = req.query;

    let filter = { isActive: true };

    // Apply filters
    if (type) filter.type = type;
    if (subject) filter.subject = subject;
    if (difficulty) filter.difficulty = difficulty;
    if (topic) filter.topic = { $regex: topic, $options: 'i' };
    if (search) {
      filter.$or = [
        { question: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const questions = await Question.find(filter)
      .populate('subject', 'name code color')
      .populate('createdBy', 'firstname lastname username')
      .sort('-createdAt');

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
    const question = await Question.findById(req.params.id)
      .populate('subject', 'name code color')
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
    const { type, question, options, correctOption, credit, subject, topic, difficulty, tags, explanation } = req.body;

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

    // Add MCQ specific fields
    if (type === 'mcq') {
      questionData.options = options;
      questionData.correctOption = Number(correctOption);
    }

    const newQuestion = await Question.create(questionData);

    // Populate subject for response
    await newQuestion.populate('subject', 'name code color');

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
    let question = await Question.findById(req.params.id);

    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    // Don't allow changing type after creation
    if (req.body.type && req.body.type !== question.type) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change question type after creation'
      });
    }

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

    question = await Question.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('subject', 'name code color');

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
    const question = await Question.findById(req.params.id);

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

// @desc    Bulk create questions from Excel
// @route   POST /api/questions/bulk-upload
// @access  Private (SuperUser)
exports.bulkCreateQuestions = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload an Excel file'
      });
    }

    const { subjectId } = req.body;

    if (!subjectId) {
      await fs.unlink(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Please select a subject for bulk upload'
      });
    }

    // Verify subject exists
    const subject = await Subject.findById(subjectId);
    if (!subject) {
      await fs.unlink(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Invalid subject selected'
      });
    }

    const parseResult = parseQuestionsExcel(req.file.path);

    if (!parseResult.success) {
      await fs.unlink(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Excel validation failed',
        errors: parseResult.errors
      });
    }

    const createdQuestions = [];
    const failedQuestions = [];

    for (const questionData of parseResult.data) {
      try {
        const question = await Question.create({
          ...questionData,
          subject: subjectId,
          createdBy: req.user._id
        });
        createdQuestions.push({
          id: question._id,
          question: question.question.substring(0, 50) + '...'
        });
      } catch (error) {
        failedQuestions.push({
          question: questionData.question.substring(0, 50) + '...',
          error: error.message
        });
      }
    }

    await fs.unlink(req.file.path);

    res.status(201).json({
      success: true,
      message: `Successfully created ${createdQuestions.length} questions`,
      createdQuestions,
      failedQuestions
    });
  } catch (error) {
    if (req.file) {
      await fs.unlink(req.file.path).catch(console.error);
    }
    next(error);
  }
};

// @desc    Get question stats
// @route   GET /api/questions/stats
// @access  Private (SuperUser)
exports.getQuestionStats = async (req, res, next) => {
  try {
    const stats = await Question.aggregate([
      { $match: { isActive: true } },
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