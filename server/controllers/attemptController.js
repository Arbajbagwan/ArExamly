const ExamAttempt = require('../models/ExamAttempt');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const PDFDocument = require('pdfkit');
const puppeteer = require("puppeteer");
const { getCache, setCache } = require('../utils/cache');

const toPlainText = (value) => {
  const raw = String(value || '');
  const withoutTags = raw.replace(/<[^>]*>/g, ' ');
  const decoded = withoutTags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return decoded.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
};

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

const resolveExamWindow = (exam) => {
  if (exam.startAt && exam.endAt) {
    return { startDT: new Date(exam.startAt), endDT: new Date(exam.endAt) };
  }
  if (exam.scheduledDate && exam.startTime && exam.endTime) {
    return {
      startDT: combineDateTime(exam.scheduledDate, exam.startTime),
      endDT: combineDateTime(exam.scheduledDate, exam.endTime)
    };
  }
  return { startDT: null, endDT: null };
};

const shuffleArray = (arr) => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const attemptHasTheoryToEvaluate = (attempt) => {
  return (attempt.answers || []).some((a) => {
    const q = a.question;
    if (!q) return false;
    if (q.type === 'theory') return true;
    if (q.type === 'passage') {
      return (q.subQuestions || []).some((sq) => sq.type === 'theory');
    }
    return false;
  });
};

const resolveAttemptExpiry = (attempt, exam) => {
  if (attempt?.expiresAt) {
    const parsed = new Date(attempt.expiresAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  if (attempt?.startedAt && exam?.duration) {
    const started = new Date(attempt.startedAt);
    if (!Number.isNaN(started.getTime())) {
      return new Date(started.getTime() + Number(exam.duration || 0) * 60 * 1000);
    }
  }

  return null;
};

const autoSubmitAttemptIfExpired = async (attempt, examMeta) => {
  if (!attempt || attempt.status !== 'in-progress') return false;

  const expiresAt = resolveAttemptExpiry(attempt, examMeta);
  if (!expiresAt || Date.now() < expiresAt.getTime()) return false;

  attempt.submittedAt = new Date(expiresAt.getTime());
  attempt.expiresAt = expiresAt;
  attempt.timeSpent = Math.max(
    0,
    Math.round((expiresAt.getTime() - new Date(attempt.startedAt).getTime()) / 1000)
  );
  await attempt.calculateMCQScore();
  const hasTheory = attemptHasTheoryToEvaluate(attempt);
  attempt.status = hasTheory ? 'auto-submitted' : 'evaluated';
  await attempt.save();
  return true;
};

const countAttemptedQuestions = (answers = []) => answers.reduce((count, answer) => {
  if (!answer) return count;

  const hasSelectedOption = typeof answer.selectedOption === 'number';
  const hasTextAnswer = typeof answer.textAnswer === 'string' && toPlainText(answer.textAnswer) !== '';
  const hasPassageResponse = Array.isArray(answer.passageResponses) && answer.passageResponses.some((response) =>
    response && (
      typeof response.selectedOption === 'number' ||
      (typeof response.textAnswer === 'string' && toPlainText(response.textAnswer) !== '')
    )
  );

  return count + (hasSelectedOption || hasTextAnswer || hasPassageResponse ? 1 : 0);
}, 0);

function generateHTML(attempt) {

  const questions = attempt.answers.map((ans, i) => {
    const q = ans.question;
    let optionsHTML = "";

    if (q.type === "mcq") {
      optionsHTML = q.options.map((opt, idx) => {
        const selected = ans.selectedOption === idx;
        const color = selected ? (ans.isCorrect ? "green" : "red") : "black";
        return `
          <div class="option" style="color:${color}">
            ${String.fromCharCode(65 + idx)}. ${opt}
            ${selected ? "<b>(Selected)</b>" : ""}
          </div>
        `;
      }).join("");
    }

    let answerHTML = "";
    if (q.type === "theory") {
      answerHTML = `
        <div class="answer">
          <b>Answer:</b> ${ans.textAnswer || "-"}
        </div>
      `;
    }

    let passageHTML = "";
    if (q.type === "passage") {
      const p = q.passageRef || {};
      passageHTML = `
        <div class="answer">
          <b>Passage:</b>
          <div>${p.title || ""}</div>
          <div>${p.text || ""}</div>
        </div>
      `;
    }

    return `
      <div class="question-block">
        <div class="question-title">
          Q${i + 1}. ${q.question}
        </div>
        ${optionsHTML}
        ${answerHTML}
        ${passageHTML}
        <div class="marks">
          Marks: ${ans.marksObtained} / ${q.credit}
          ${q.type === "mcq" ? `| ${ans.isCorrect ? "Correct" : "Incorrect"}` : ""}
        </div>
      </div>
    `;
  }).join("");

  return `
    <html>
    <head>
    <style>

      body {
        font-family: Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
      }

      /* ✅ Fix: strip <p> tag margins from rich text editor */
      p {
        margin: 0;
        padding: 0;
        display: inline;
      }

      .question-block {
        margin-bottom: 24px;
        page-break-inside: avoid;
        break-inside: avoid;
      }

      .question-title {
        font-weight: 600;
        margin-bottom: 6px;
      }

      .option {
        margin-left: 20px;
        margin-top: 3px;
      }

      .answer {
        margin-left: 20px;
        margin-top: 6px;
      }

      .marks {
        margin-left: 20px;
        margin-top: 6px;
        font-size: 13px;
      }

      img {
        max-width: 350px;
        display: block;
        margin-top: 6px;
        margin-bottom: 6px;
        page-break-inside: avoid;
      }

      hr {
        margin: 15px 0;
      }

    </style>
    </head>
    <body>
      <h1>${attempt.exam.title}</h1>
      <div class="header">
        <div><b>Username:</b> ${attempt.examinee.username}</div>
        <div><b>Submitted:</b> ${new Date(attempt.submittedAt).toLocaleString()}</div>
        <div><b>Score:</b> ${attempt.totalMarksObtained} / ${attempt.totalMarksPossible}</div>
      </div>
      <hr>
      ${questions}
    </body>
    </html>
  `;
}

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
        .select('title description duration minimumAttemptQuestions startAt endAt scheduledDate startTime endTime shuffleQuestions shuffleOptions selectionMode randomConfig status createdBy assignedTo questions.question')
        .lean();

      if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

      await setCache(cacheKey, exam, 600);
    }

    // assigned check
    const isAssigned = exam.assignedTo?.some(id => id.toString() === userId);
    if (!isAssigned) return res.status(403).json({ success: false, message: 'You are not assigned to this exam' });

    // time check
    const now = new Date();
    const { startDT, endDT } = resolveExamWindow(exam);
    if (!startDT || !endDT) {
      return res.status(400).json({ success: false, message: 'Exam schedule is not configured correctly' });
    }
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

    const nowMs = now.getTime();
    const existingExpiry = resolveAttemptExpiry(attempt, exam);
    if (attempt && existingExpiry && nowMs >= existingExpiry.getTime()) {
      const fullAttempt = await ExamAttempt.findById(attempt._id).populate('answers.question');
      if (fullAttempt) {
        await autoSubmitAttemptIfExpired(fullAttempt, exam);
      }
      return res.status(400).json({ success: false, message: 'Exam time is over' });
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

          const requestedMcq = Number(conf.mcqCount || 0);
          const requestedTheory = Number(conf.theoryCount || 0);
          const requestedPassage = Number(conf.passageCount || 0);
          if (
            mcqs.length < requestedMcq ||
            theories.length < requestedTheory ||
            passages.length < requestedPassage
          ) {
            return res.status(400).json({
              success: false,
              message: 'Question pool is insufficient for configured random split. Please contact administrator.'
            });
          }
        } else {
          // Case 1: Any Type Mode
          selectedQuestions = await Question.aggregate([
            { $match: filter },
            { $sample: { size: conf.totalQuestions } },
            { $project: { _id: 1, type: 1, options: 1, subQuestions: 1 } }
          ]);

          const requestedTotal = Number(conf.totalQuestions || 0);
          if (requestedTotal > 0 && selectedQuestions.length < requestedTotal) {
            return res.status(400).json({
              success: false,
              message: 'Question pool is insufficient for configured random count. Please contact administrator.'
            });
          }
        }
      } else {
        // Manual Mode: use fixed questions and fetch only fields needed for attempt creation.
        const fixedIds = (exam.questions || []).map((q) => q.question).filter(Boolean);
        selectedQuestions = await Question.find({ _id: { $in: fixedIds } })
          .select('_id type options subQuestions')
          .lean();
      }

      if (!Array.isArray(selectedQuestions) || selectedQuestions.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No questions available for this exam. Please contact administrator.'
        });
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
        const startedAt = new Date();
        const expiresAt = new Date(startedAt.getTime() + Number(exam.duration || 0) * 60 * 1000);
        attempt = await ExamAttempt.create({
          exam: examId,
          examinee: req.user._id,
          startedAt,
          expiresAt,
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

    if (attempt && !attempt.expiresAt) {
      const derivedExpiresAt = resolveAttemptExpiry(attempt, exam);
      if (derivedExpiresAt) {
        await ExamAttempt.updateOne(
          { _id: attempt._id, expiresAt: { $exists: false } },
          { expiresAt: derivedExpiresAt }
        );
        attempt = {
          ...attempt,
          expiresAt: derivedExpiresAt
        };
      }
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
      minimumAttemptQuestions: exam.minimumAttemptQuestions || 0,
      startAt: exam.startAt || startDT,
      endAt: exam.endAt || endDT,
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
      exam: safeExam,
      serverNow: new Date().toISOString(),
      expiresAt: attempt.expiresAt || resolveAttemptExpiry(attempt, exam)?.toISOString() || null
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
    const expiresAt = resolveAttemptExpiry(attempt, exam);
    if (expiresAt && Date.now() >= expiresAt.getTime()) {
      attempt.submittedAt = new Date(expiresAt.getTime());
      attempt.expiresAt = expiresAt;
      attempt.timeSpent = Math.max(0, Math.round((expiresAt.getTime() - new Date(attempt.startedAt).getTime()) / 1000));
      await attempt.calculateMCQScore();
      const hasTheory = attemptHasTheoryToEvaluate(attempt);
      attempt.status = hasTheory ? 'auto-submitted' : 'evaluated';
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

    const exam = await Exam.findById(attempt.exam).select('duration minimumAttemptQuestions');
    const expiresAt = resolveAttemptExpiry(attempt, exam);
    if (expiresAt && Date.now() >= expiresAt.getTime()) {
      attempt.submittedAt = new Date(expiresAt.getTime());
      attempt.timeSpent = Math.max(0, Math.round((expiresAt.getTime() - new Date(attempt.startedAt).getTime()) / 1000));
      attempt.expiresAt = expiresAt;
      await attempt.calculateMCQScore();
      const hasTheory = attemptHasTheoryToEvaluate(attempt);
      attempt.status = hasTheory ? 'auto-submitted' : 'evaluated';
      await attempt.save();
      return res.status(400).json({ success: false, message: 'Time limit exceeded. Exam auto-submitted.' });
    }

    const minimumAttemptQuestions = Number(exam?.minimumAttemptQuestions || 0);
    const attemptedQuestions = countAttemptedQuestions(attempt.answers || []);
    if (minimumAttemptQuestions > 0 && attemptedQuestions < minimumAttemptQuestions) {
      return res.status(400).json({
        success: false,
        message: `You must attempt at least ${minimumAttemptQuestions} questions before submitting this exam`,
        minimumAttemptQuestions,
        attemptedQuestions
      });
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
    let attempts = await ExamAttempt.find({ exam: req.params.examId })
      .populate('examinee', 'firstname lastname username')
      .populate('exam', 'title duration')
      .populate('answers.question')
      .sort('-createdAt');

    for (const attempt of attempts) {
      await autoSubmitAttemptIfExpired(attempt, { duration: attempt.exam?.duration });
    }

    attempts = await ExamAttempt.find({ exam: req.params.examId })
      .populate('examinee', 'firstname lastname username')
      .populate('exam', 'title duration')
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
    let attempts = await ExamAttempt.find({ examinee: req.user._id })
      .populate('exam', 'title totalMarks duration')
      .populate('examinee', 'username firstname lastname') // ✅ FIX 1
      .populate({
        path: 'answers.question',
        populate: { path: 'passageRef' }
      }) // include passage details
      .sort('-createdAt');

    for (const attempt of attempts) {
      await autoSubmitAttemptIfExpired(attempt, { duration: attempt.exam?.duration });
    }

    attempts = await ExamAttempt.find({ examinee: req.user._id })
      .populate('exam', 'title totalMarks duration')
      .populate('examinee', 'username firstname lastname')
      .populate({
        path: 'answers.question',
        populate: { path: 'passageRef' }
      })
      .sort('-createdAt');

    res.status(200).json({
      success: true,
      attempts
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete exam attempt (allow reappear)
// @route   DELETE /api/attempts/:attemptId
// @access  Private (Admin / SuperUser)

exports.deleteAttempt = async (req, res, next) => {
  try {

    const attempt = await ExamAttempt.findById(req.params.attemptId);

    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: "Attempt not found"
      });
    }

    await attempt.deleteOne();

    res.status(200).json({
      success: true,
      message: "Attempt deleted successfully"
    });

  } catch (error) {
    next(error);
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
        if (marksObtained < 0 || marksObtained > q.credit) {
          return res.status(400).json({
            success: false,
            message: `Marks must be between 0 and ${q.credit}`
          });
        }
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
      .populate("exam")
      .populate("examinee")
      .populate({
        path: "answers.question",
        populate: { path: "passageRef" }
      });

    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: "Attempt not found"
      });
    }

    const html = generateHTML(attempt);

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "networkidle0"
    });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        bottom: "20mm",
        left: "15mm",
        right: "15mm"
      }
    });

    await browser.close();

    const filename = `${attempt.examinee.username}_${attempt.exam.title}_result.pdf`
      .replace(/\s+/g, "_");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    res.send(pdf);

  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to generate PDF"
    });
  }
};
