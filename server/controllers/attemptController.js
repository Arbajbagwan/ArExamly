const ExamAttempt = require('../models/ExamAttempt');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const PDFDocument = require('pdfkit');

const combineDateTime = (date, timeString) => {
  const [hours, minutes] = timeString.split(':');
  const combined = new Date(date);
  combined.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
  return combined;
};

const shuffleIndices = (n) => {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr; // displayedIndex -> originalIndex
};

exports.startExam = async (req, res, next) => {
  try {
    const examId = req.params.examId;
    const cacheKey = `exam:${examId}:data`;
    let exam;

    // Cache exam meta only (safe)
    if (global.redis) {
      try {
        const cached = await global.redis.get(cacheKey);
        if (cached) exam = JSON.parse(cached);
      } catch (e) {
        console.warn('Redis read failed:', e.message);
      }
    }

    if (!exam) {
      // IMPORTANT: we still populate questions.question because we may use it as POOL
      exam = await Exam.findById(examId)
        .populate('questions.question')
        .lean();

      if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

      if (global.redis) {
        try {
          await global.redis.setex(cacheKey, 600, JSON.stringify(exam));
        } catch (e) {
          console.warn('Redis write failed:', e.message);
        }
      }
    }

    // assigned check
    const isAssigned = exam.assignedTo?.some(id => id.toString() === req.user._id.toString());
    if (!isAssigned) return res.status(403).json({ success: false, message: 'You are not assigned to this exam' });

    // time check
    const now = new Date();
    const startDT = combineDateTime(exam.scheduledDate, exam.startTime);
    const endDT = combineDateTime(exam.scheduledDate, exam.endTime);
    if (now < startDT) return res.status(400).json({ success: false, message: 'Exam has not started yet' });
    if (now > endDT) return res.status(400).json({ success: false, message: 'Exam has ended' });

    if (exam.status !== 'active') {
      await Exam.updateOne(
        { _id: exam._id, status: { $ne: 'cancelled' } },
        { status: 'active' }
      );
    }

    // Find attempt
    let attempt = await ExamAttempt.findOne({ exam: examId, examinee: req.user._id });

    if (attempt && attempt.status !== 'in-progress') {
      return res.status(400).json({ success: false, message: 'You have already submitted this exam' });
    }

    let createdNew = false;

    // Create attempt with PER-USER random selection
    if (!attempt) {
      let selectedQuestions = [];

      // If Random mode, pick questions now for THIS specific user
      if (exam.selectionMode === 'random' && exam.randomConfig) {
        const conf = exam.randomConfig;
        const filter = { isActive: true };
        if (conf.subjectIds?.length) filter.subject = { $in: conf.subjectIds };
        if (conf.difficulty) filter.difficulty = conf.difficulty;

        if (conf.mcqCount > 0 || conf.theoryCount > 0) {
          // Case 2: Split Mode
          const mcqs = await Question.aggregate([
            { $match: { ...filter, type: 'mcq' } },
            { $sample: { size: conf.mcqCount } }
          ]);
          const theories = await Question.aggregate([
            { $match: { ...filter, type: 'theory' } },
            { $sample: { size: conf.theoryCount } }
          ]);
          selectedQuestions = [...mcqs, ...theories];
        } else {
          // Case 1: Any Type Mode
          selectedQuestions = await Question.aggregate([
            { $match: filter },
            { $sample: { size: conf.totalQuestions } }
          ]);
        }
      } else {
        // Manual Mode: use fixed questions
        selectedQuestions = exam.questions.map(q => q.question);
      }

      // Create Attempt
      attempt = await ExamAttempt.create({
        exam: examId,
        examinee: req.user._id,
        answers: selectedQuestions.map(q => ({
          question: q._id,
          // Shuffle options logic here
          optionOrder: (exam.shuffleOptions && q.type === 'mcq') ? shuffleIndices(q.options.length) : []
        }))
      });
    }

    // Now return SAFE exam only with attempt-selected questions
    const attemptQuestionIds = attempt.answers.map(a => a.question.toString());
    const qDocs = await Question.find({ _id: { $in: attemptQuestionIds } }).lean();
    const qMap = new Map(qDocs.map(q => [q._id.toString(), q]));

    const safeQuestions = attempt.answers.map((a) => {
      const q = qMap.get(a.question.toString());
      if (!q) return null;

      const safeQ = { ...q };
      if (safeQ.type === 'mcq') {
        delete safeQ.correctOption;

        // Apply option shuffle using attempt mapping
        if (exam.shuffleOptions && Array.isArray(a.optionOrder) && Array.isArray(safeQ.options)) {
          if (a.optionOrder.length === safeQ.options.length) {
            safeQ.options = a.optionOrder.map(idx => safeQ.options[idx]);
          }
        }
      }
      return { question: safeQ };
    }).filter(Boolean);

    const safeExam = {
      _id: exam._id,
      title: exam.title,
      description: exam.description,
      duration: exam.duration,
      scheduledDate: exam.scheduledDate,
      startTime: exam.startTime,
      endTime: exam.endTime,
      shuffleQuestions: exam.shuffleQuestions,
      shuffleOptions: exam.shuffleOptions,
      selectionMode: exam.selectionMode,
      questions: safeQuestions
    };

    return res.json({
      success: true,
      message: createdNew ? 'Exam started!' : 'Resuming exam...',
      attempt,
      exam: safeExam
    });

  } catch (error) {
    console.error('startExam error:', error);
    next(error);
  }
};

// Save answer - unchanged (perfect as is)
exports.saveAnswer = async (req, res, next) => {
  try {
    const { questionId, selectedOption, textAnswer } = req.body;
    const attempt = await ExamAttempt.findById(req.params.attemptId);

    if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found' });
    if (attempt.examinee.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (attempt.status !== 'in-progress') {
      return res.status(400).json({ success: false, message: 'Cannot modify submitted exam' });
    }

    const exam = await Exam.findById(attempt.exam);
    const timeElapsed = (Date.now() - attempt.startedAt) / 1000 / 60;
    if (timeElapsed > exam.duration) {
      attempt.status = 'auto-submitted';
      attempt.submittedAt = new Date();
      await attempt.save();
      return res.status(400).json({ success: false, message: 'Time limit exceeded. Exam auto-submitted.' });
    }

    const answerIndex = attempt.answers.findIndex(a => a.question.toString() === questionId);
    if (answerIndex === -1) {
      return res.status(400).json({ success: false, message: 'Question not found' });
    }

    if (selectedOption !== undefined) {
      const sel = Number(selectedOption);

      const order = attempt.answers[answerIndex].optionOrder;
      if (Array.isArray(order) && order.length > 0) {
        if (sel < 0 || sel >= order.length) {
          return res.status(400).json({
            success: false,
            message: 'Invalid option index'
          });
        }
      }

      attempt.answers[answerIndex].selectedOption = sel;
    }
    if (textAnswer !== undefined) attempt.answers[answerIndex].textAnswer = textAnswer;

    await attempt.save();
    res.json({ success: true, message: 'Answer saved' });
  } catch (error) {
    next(error);
  }
};

// Submit exam - unchanged
exports.submitExam = async (req, res, next) => {
  try {
    const attempt = await ExamAttempt.findById(req.params.attemptId).populate('answers.question');
    if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found' });
    if (attempt.examinee.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (attempt.status !== 'in-progress') {
      return res.status(400).json({ success: false, message: 'Exam already submitted' });
    }

    attempt.submittedAt = new Date();
    attempt.timeSpent = (attempt.submittedAt - attempt.startedAt) / 1000;

    await attempt.calculateMCQScore();

    const hasTheory = attempt.answers.some(a => a.question?.type === 'theory');
    attempt.status = hasTheory ? 'submitted' : 'evaluated';

    await attempt.save();

    res.json({
      success: true,
      message: 'Exam submitted successfully',
      attempt: {
        totalMarksObtained: attempt.totalMarksObtained,
        percentage: attempt.percentage,
        status: attempt.status
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get exam attempts (for superuser)
// @route   GET /api/attempts/exam/:examId
// @access  Private (SuperUser)
exports.getExamAttempts = async (req, res, next) => {
  try {
    const attempts = await ExamAttempt.find({ exam: req.params.examId })
      .populate('examinee', 'firstname lastname username')
      .populate('exam', 'title')
      .populate('answers.question')
      .sort('-createdAt');

    res.status(200).json({
      success: true,
      count: attempts.length,
      attempts
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get my attempts (for examinee)
// @route   GET /api/attempts/my
// @access  Private (Examinee)
exports.getMyAttempts = async (req, res, next) => {
  try {
    const attempts = await ExamAttempt.find({ examinee: req.user._id })
      .populate('exam', 'title totalMarks')
      .populate('examinee', 'username firstname lastname') // ✅ FIX 1
      .populate('answers.question') // ✅ FIX 2
      .sort('-createdAt');

    res.status(200).json({
      success: true,
      attempts
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Evaluate theory answers
// @route   PUT /api/attempts/:attemptId/evaluate
// @access  Private (SuperUser)
exports.evaluateTheoryAnswers = async (req, res, next) => {
  try {
    const { answers } = req.body; // Array of { questionId, marksObtained, feedback }

    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide answers to evaluate'
      });
    }

    const attempt = await ExamAttempt.findById(req.params.attemptId)
      .populate('answers.question');

    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: 'Attempt not found'
      });
    }

    // Update theory answers
    answers.forEach(({ questionId, marksObtained, feedback }) => {
      const answerIndex = attempt.answers.findIndex(
        a => a.question._id.toString() === questionId
      );

      if (answerIndex !== -1 && attempt.answers[answerIndex].question.type === 'theory') {
        attempt.answers[answerIndex].marksObtained = marksObtained;
        attempt.answers[answerIndex].feedback = feedback;
        attempt.answers[answerIndex].reviewedBy = req.user._id;
      }
    });

    // Recalculate total marks
    attempt.totalMarksObtained = attempt.answers.reduce(
      (sum, ans) => sum + (ans.marksObtained || 0),
      0
    );

    // Recalculate percentage
    const exam = await Exam.findById(attempt.exam);
    if (exam && exam.totalMarks > 0) {
      attempt.percentage = (attempt.totalMarksObtained / exam.totalMarks) * 100;
    }

    attempt.status = 'evaluated';
    await attempt.save();

    res.status(200).json({
      success: true,
      message: 'Theory answers evaluated successfully',
      attempt
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Download attempt PDF
// @route   GET /api/attempts/:attemptId/pdf
// @access  Private (SuperUser)
exports.downloadAttemptPDF = async (req, res) => {
  try {
    const attempt = await ExamAttempt.findById(req.params.attemptId)
      .populate('exam')
      .populate('examinee')
      .populate('answers.question');

    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Attempt not found' });
    }

    const filename = `${attempt.examinee.username}_${attempt.exam.title}_result.pdf`
      .replace(/\s+/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    // ===== HEADER =====
    doc.fontSize(11).text(`Exam: ${attempt.exam.title}`);
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Username: ${attempt.examinee.username}`);
    doc.text(`Submitted At: ${attempt.submittedAt.toLocaleString()}`);
    doc.text(
      `Score: ${attempt.totalMarksObtained} / ${attempt.totalMarksPossible}`
    );

    doc.moveDown();

    // ===== QUESTIONS =====
    attempt.answers.forEach((ans, i) => {
      const q = ans.question;

      doc.fontSize(12).text(`Q${i + 1}. ${q.question}`);
      doc.moveDown(0.3);

      if (q.type === 'mcq') {
        q.options.forEach((opt, idx) => {
          const selected = ans.selectedOption === idx;
          const marker = selected ? 'Selected' : '   ';

          doc.text(
            `${String.fromCharCode(65 + idx)}. ${opt} ${marker} `,
            { indent: 20 }
          );
        });

        doc.moveDown(0.3);
        doc.fontSize(10).text(
          `Marks: ${ans.marksObtained} / ${q.credit} | ${ans.isCorrect ? 'Correct' : 'Incorrect'}`,
          { indent: 20 }
        );
      } else {
        doc.text(`Answer: ${ans.textAnswer || '-'}`, { indent: 20 });
        doc.text(`Marks: ${ans.marksObtained} / ${q.credit}`, { indent: 20 });
      }

      doc.moveDown();
    });

    doc.end();
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate PDF' });
  }
};