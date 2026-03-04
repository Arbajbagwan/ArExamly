const ExamAttempt = require('../models/ExamAttempt');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const PDFDocument = require('pdfkit');
const { getCache, setCache } = require('../utils/cache');

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

const shuffleArray = (arr) => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

exports.startExam = async (req, res, next) => {
  try {
    const examId = req.params.examId;
    const userId = req.user._id.toString();
    const cacheKey = `exam:${examId}:data`;
    let exam;

    // Cache exam meta only (safe)
    exam = await getCache(cacheKey);

    if (!exam) {
      exam = await Exam.findById(examId)
        .select('title description duration scheduledDate startTime endTime shuffleQuestions shuffleOptions selectionMode randomConfig status createdBy assignedTo questions.question')
        .lean();

      if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

      await setCache(cacheKey, exam, 600);
    }

    // assigned check
    const isAssigned = exam.assignedTo?.some(id => id.toString() === userId);
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
    let attempt = await ExamAttempt.findOne({ exam: examId, examinee: req.user._id }).lean();

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
        const filter = {
          isActive: true,
          createdBy: exam.createdBy
        };
        if (conf.subjectIds?.length) filter.subject = { $in: conf.subjectIds };
        if (conf.difficulty) filter.difficulty = conf.difficulty;

        if ((conf.mcqCount || 0) > 0 || (conf.theoryCount || 0) > 0 || (conf.passageCount || 0) > 0) {
          // Case 2: Split Mode
          const mcqs = await Question.aggregate([
            { $match: { ...filter, type: 'mcq' } },
            { $sample: { size: conf.mcqCount } },
            { $project: { _id: 1, type: 1, options: 1, subQuestions: 1 } }
          ]);
          const theories = await Question.aggregate([
            { $match: { ...filter, type: 'theory' } },
            { $sample: { size: conf.theoryCount } },
            { $project: { _id: 1, type: 1, options: 1, subQuestions: 1 } }
          ]);
          const passages = await Question.aggregate([
            { $match: { ...filter, type: 'passage' } },
            { $sample: { size: conf.passageCount || 0 } },
            { $project: { _id: 1, type: 1, options: 1, subQuestions: 1 } }
          ]);
          selectedQuestions = [...mcqs, ...theories, ...passages];
        } else {
          // Case 1: Any Type Mode
          selectedQuestions = await Question.aggregate([
            { $match: filter },
            { $sample: { size: conf.totalQuestions } },
            { $project: { _id: 1, type: 1, options: 1, subQuestions: 1 } }
          ]);
        }
      } else {
        // Manual Mode: use fixed questions and fetch only fields needed for attempt creation.
        const fixedIds = (exam.questions || []).map((q) => q.question).filter(Boolean);
        selectedQuestions = await Question.find({ _id: { $in: fixedIds } })
          .select('_id type options subQuestions')
          .lean();
      }

      // Apply question-order shuffle for this attempt when enabled.
      // For random mode, allow either exam.shuffleQuestions or randomConfig.shuffleSelectedQuestions.
      const shouldShuffleQuestionOrder =
        !!exam.shuffleQuestions ||
        (exam.selectionMode === 'random' && !!exam.randomConfig?.shuffleSelectedQuestions);

      if (shouldShuffleQuestionOrder && selectedQuestions.length > 1) {
        selectedQuestions = shuffleArray(selectedQuestions);
      }

      // Create Attempt (idempotent for double-start race)
      try {
        attempt = await ExamAttempt.create({
          exam: examId,
          examinee: req.user._id,
          answers: selectedQuestions.map(q => ({
            question: q._id,
            optionOrder: (exam.shuffleOptions && q.type === 'mcq') ? shuffleIndices(q.options.length) : [],
            passageOptionOrders: (exam.shuffleOptions && q.type === 'passage')
              ? (q.subQuestions || [])
                .filter((sq) => sq.type === 'mcq' && Array.isArray(sq.options) && sq.options.length > 1)
                .map((sq) => ({
                  subQuestionId: String(sq._id),
                  optionOrder: shuffleIndices(sq.options.length)
                }))
              : []
          }))
        });
      } catch (createErr) {
        if (createErr.code === 11000) {
          attempt = await ExamAttempt.findOne({ exam: examId, examinee: req.user._id }).lean();
        } else {
          throw createErr;
        }
      }

      createdNew = true;
    }

    // For resume/start retries, cache prepared safe questions per attempt for a short window.
    const attemptCacheKey = `attempt:${attempt._id}:safeQuestions`;
    let safeQuestions = null;
    safeQuestions = await getCache(attemptCacheKey);

    // Now return SAFE exam only with attempt-selected questions
    if (!safeQuestions) {
      const attemptQuestionIds = attempt.answers.map(a => a.question.toString());
      const qDocs = await Question.find({
        _id: { $in: attemptQuestionIds }
      })
        .select('_id type question options credit subject topic category difficulty tags explanation subQuestions passageRef')
        .populate('passageRef', 'title text topic complexity marksLabel')
        .lean();
      const qMap = new Map(qDocs.map(q => [q._id.toString(), q]));

      safeQuestions = attempt.answers.map((a) => {
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
        if (safeQ.type === 'passage' && Array.isArray(safeQ.subQuestions)) {
          safeQ.subQuestions = safeQ.subQuestions.map((sq) => {
            const out = { ...sq };
            if (out.type === 'mcq') {
              delete out.correctOption;
              if (exam.shuffleOptions && Array.isArray(out.options)) {
                const sqOrder = (a.passageOptionOrders || []).find(
                  (po) => String(po.subQuestionId) === String(out._id)
                )?.optionOrder;
                if (Array.isArray(sqOrder) && sqOrder.length === out.options.length) {
                  out.options = sqOrder.map((idx) => out.options[idx]);
                }
              }
            }
            return out;
          });
        }
        return { question: safeQ };
      }).filter(Boolean);

      await setCache(attemptCacheKey, safeQuestions, 180);
    }

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
    const { questionId, selectedOption, textAnswer, subQuestionId } = req.body;
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

    const qDoc = await Question.findById(questionId).select('type subQuestions');

    if (qDoc?.type === 'passage' && subQuestionId) {
      const subExists = (qDoc.subQuestions || []).some((sq) => String(sq._id) === String(subQuestionId));
      if (!subExists) {
        return res.status(400).json({ success: false, message: 'Invalid passage sub question' });
      }
      const responses = attempt.answers[answerIndex].passageResponses || [];
      const idx = responses.findIndex((r) => String(r.subQuestionId) === String(subQuestionId));
      const payload = {
        subQuestionId: String(subQuestionId),
        ...(selectedOption !== undefined ? { selectedOption: Number(selectedOption) } : {}),
        ...(textAnswer !== undefined ? { textAnswer } : {})
      };
      if (idx >= 0) responses[idx] = { ...responses[idx].toObject?.() || responses[idx], ...payload };
      else responses.push(payload);
      attempt.answers[answerIndex].passageResponses = responses;
    }

    if (qDoc?.type !== 'passage' && selectedOption !== undefined) {
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
    if (qDoc?.type !== 'passage' && textAnswer !== undefined) attempt.answers[answerIndex].textAnswer = textAnswer;

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

    const hasTheory = attempt.answers.some(a =>
      a.question?.type === 'theory' ||
      (a.question?.type === 'passage' && (a.question?.subQuestions || []).some((sq) => sq.type === 'theory'))
    );
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
      .populate({
        path: 'answers.question',
        populate: { path: 'passageRef' }
      }) // include passage details
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
    const { answers } = req.body; // Array of { questionId, subQuestionId?, marksObtained, feedback }

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

    // Update theory answers (normal + passage sub-questions)
    answers.forEach(({ questionId, subQuestionId, marksObtained, feedback }) => {
      const answerIndex = attempt.answers.findIndex(
        a => a.question._id.toString() === questionId
      );

      if (answerIndex === -1) return;

      const ans = attempt.answers[answerIndex];
      const q = ans.question;

      if (q.type === 'theory') {
        ans.marksObtained = marksObtained;
        ans.feedback = feedback;
        ans.reviewedBy = req.user._id;
        return;
      }

      if (q.type === 'passage' && subQuestionId) {
        const sub = (q.subQuestions || []).find((sq) => sq._id.toString() === subQuestionId);
        if (!sub || sub.type !== 'theory') return;

        const responses = ans.passageResponses || [];
        const rIndex = responses.findIndex((r) => String(r.subQuestionId) === String(subQuestionId));

        if (rIndex !== -1) {
          responses[rIndex].marksObtained = marksObtained;
          responses[rIndex].feedback = feedback;
        } else {
          responses.push({
            subQuestionId: String(subQuestionId),
            marksObtained,
            feedback
          });
        }

        ans.passageResponses = responses;
      }
    });

    // Recalculate score with MCQ + evaluated theory (normal/passage)
    await attempt.calculateMCQScore();

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
      .populate({
        path: 'answers.question',
        populate: { path: 'passageRef' }
      });

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
      } else if (q.type === 'theory') {
        doc.text(`Answer: ${ans.textAnswer || '-'}`, { indent: 20 });
        doc.text(`Marks: ${ans.marksObtained} / ${q.credit}`, { indent: 20 });
      } else if (q.type === 'passage') {
        if (q.passageRef?.title) {
          doc.fontSize(11).text(`Passage: ${q.passageRef.title}`, { indent: 20 });
        }
        if (q.passageRef?.text) {
          doc.fontSize(10).text(q.passageRef.text, { indent: 20 });
        }
        if (q.passageRef?.marksLabel) {
          doc.fontSize(10).text(`Passage Marks: ${q.passageRef.marksLabel}`, { indent: 20 });
        }
        doc.moveDown(0.4);

        (q.subQuestions || []).forEach((sq, sqIndex) => {
          const resp = (ans.passageResponses || []).find(
            (r) => String(r.subQuestionId) === String(sq._id)
          );
          doc.fontSize(10).text(`  ${sqIndex + 1}. ${sq.prompt}`, { indent: 20 });

          if (sq.type === 'mcq') {
            (sq.options || []).forEach((opt, idx) => {
              const selected = Number(resp?.selectedOption) === idx;
              const marker = selected ? 'Selected' : '';
              doc.text(`     ${String.fromCharCode(65 + idx)}. ${opt} ${marker}`, { indent: 20 });
            });
          } else {
            doc.text(`     Answer: ${resp?.textAnswer || '-'}`, { indent: 20 });
          }

          const obtained = resp?.marksObtained ?? 0;
          doc.text(`     Marks: ${obtained} / ${sq.credit}`, { indent: 20 });
          doc.moveDown(0.3);
        });
      }

      doc.moveDown();
    });

    doc.end();
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate PDF' });
  }
};

