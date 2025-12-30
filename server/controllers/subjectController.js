const Subject = require('../models/Subject');
const Question = require('../models/Question');

// @desc    Get all subjects
// @route   GET /api/subjects
// @access  Private (SuperUser)
exports.getSubjects = async (req, res, next) => {
  try {
    const subjects = await Subject.find({ isActive: true })
      .populate('createdBy', 'firstname lastname')
      .sort('name');

    // Get question count for each subject
    const subjectsWithCount = await Promise.all(
      subjects.map(async (subject) => {
        const questionCount = await Question.countDocuments({
          subject: subject._id,
          isActive: true
        });
        return {
          ...subject.toObject(),
          questionCount
        };
      })
    );

    res.status(200).json({
      success: true,
      count: subjectsWithCount.length,
      subjects: subjectsWithCount
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single subject
// @route   GET /api/subjects/:id
// @access  Private (SuperUser)
exports.getSubject = async (req, res, next) => {
  try {
    const subject = await Subject.findById(req.params.id)
      .populate('createdBy', 'firstname lastname');

    if (!subject) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found'
      });
    }

    res.status(200).json({
      success: true,
      subject
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create subject
// @route   POST /api/subjects
// @access  Private (SuperUser)
exports.createSubject = async (req, res, next) => {
  try {
    const { name, description, code, color } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Please provide subject name'
      });
    }

    // Check if subject already exists
    const existingSubject = await Subject.findOne({ name: name.trim() });
    if (existingSubject) {
      return res.status(400).json({
        success: false,
        message: 'Subject with this name already exists'
      });
    }

    const subject = await Subject.create({
      name: name.trim(),
      description,
      code: code ? code.toUpperCase() : undefined,
      color: color || '#3B82F6',
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Subject created successfully',
      subject
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Subject with this name or code already exists'
      });
    }
    next(error);
  }
};

// @desc    Update subject
// @route   PUT /api/subjects/:id
// @access  Private (SuperUser)
exports.updateSubject = async (req, res, next) => {
  try {
    const { name, description, code, color } = req.body;

    let subject = await Subject.findById(req.params.id);

    if (!subject) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found'
      });
    }

    // Update fields
    if (name) subject.name = name.trim();
    if (description !== undefined) subject.description = description;
    if (code) subject.code = code.toUpperCase();
    if (color) subject.color = color;

    await subject.save();

    res.status(200).json({
      success: true,
      message: 'Subject updated successfully',
      subject
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Subject with this name or code already exists'
      });
    }
    next(error);
  }
};

// @desc    Delete subject
// @route   DELETE /api/subjects/:id
// @access  Private (SuperUser)
exports.deleteSubject = async (req, res, next) => {
  try {
    const subject = await Subject.findById(req.params.id);

    if (!subject) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found'
      });
    }

    // Check if any questions are using this subject
    const questionCount = await Question.countDocuments({ 
      subject: req.params.id,
      isActive: true 
    });

    if (questionCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete subject. ${questionCount} question(s) are using this subject.`
      });
    }

    // Soft delete
    subject.isActive = false;
    await subject.save();

    res.status(200).json({
      success: true,
      message: 'Subject deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get questions by subject
// @route   GET /api/subjects/:id/questions
// @access  Private (SuperUser)
exports.getSubjectQuestions = async (req, res, next) => {
  try {
    const questions = await Question.find({
      subject: req.params.id,
      isActive: true
    })
      .populate('subject', 'name code color')
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