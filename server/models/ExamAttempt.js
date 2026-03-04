const mongoose = require('mongoose');

const examAttemptSchema = new mongoose.Schema({
  exam: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true
  },
  examinee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  submittedAt: {
    type: Date
  },
  timeSpent: {
    type: Number // in seconds
  },
  answers: [{
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },

    // what examinee clicked (index in the SHUFFLED options they saw)
    selectedOption: Number,

    // store the mapping from displayedIndex -> originalIndex
    optionOrder: [Number],
    passageOptionOrders: [{
      subQuestionId: String,
      optionOrder: [Number]
    }],
    passageResponses: [{
      subQuestionId: String,
      selectedOption: Number,
      textAnswer: String,
      isCorrect: Boolean,
      marksObtained: { type: Number, default: 0 },
      feedback: String
    }],

    textAnswer: String,
    isCorrect: Boolean,
    marksObtained: { type: Number, default: 0 },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    feedback: String
  }],
  totalMarksObtained: {
    type: Number,
    default: 0
  },
  totalMarksPossible: {
    type: Number,
    default: 0
  },
  percentage: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['in-progress', 'submitted', 'evaluated', 'auto-submitted'],
    default: 'in-progress'
  },
  ipAddress: String,
  userAgent: String
}, {
  timestamps: true
});

// Ensure one attempt per user per exam (can be modified for multiple attempts)
examAttemptSchema.index({ exam: 1, examinee: 1 }, { unique: true });
examAttemptSchema.index({ examinee: 1, createdAt: -1 });
examAttemptSchema.index({ exam: 1, status: 1, createdAt: -1 });

// Auto-calculate MCQ scores
examAttemptSchema.methods.calculateMCQScore = async function () {
  await this.populate('answers.question');

  this.answers.forEach((answer) => {
    if (!answer.question) return;

    if (answer.question.type === 'mcq') {
      // If user didn't answer, treat as 0
      if (typeof answer.selectedOption !== 'number') {
        answer.isCorrect = false;
        answer.marksObtained = 0;
        return;
      }

      // Map displayed index -> original index if optionOrder exists
      let chosenOriginalIndex = answer.selectedOption;

      if (Array.isArray(answer.optionOrder) && answer.optionOrder.length > 0) {
        // Validate range
        if (answer.selectedOption < 0 || answer.selectedOption >= answer.optionOrder.length) {
          answer.isCorrect = false;
          answer.marksObtained = 0;
          return;
        }

        chosenOriginalIndex = answer.optionOrder[answer.selectedOption];
      }

      answer.isCorrect = chosenOriginalIndex === answer.question.correctOption;
      answer.marksObtained = answer.isCorrect ? (answer.question.credit || 0) : 0;
    }

    if (answer.question.type === 'passage') {
      const responseMap = new Map(
        (answer.passageResponses || []).map((r) => [String(r.subQuestionId), r])
      );
      const optionOrderMap = new Map(
        (answer.passageOptionOrders || []).map((o) => [String(o.subQuestionId), o.optionOrder || []])
      );
      let total = 0;
      (answer.question.subQuestions || []).forEach((sq) => {
        const key = String(sq._id);
        const resp = responseMap.get(key);
        if (!resp) return;

        if (sq.type === 'mcq') {
          const selected = Number(resp.selectedOption);
          const order = optionOrderMap.get(key) || [];

          let chosenOriginalIndex = selected;
          if (Array.isArray(order) && order.length > 0) {
            if (selected < 0 || selected >= order.length) {
              resp.isCorrect = false;
              resp.marksObtained = 0;
              return;
            }
            chosenOriginalIndex = order[selected];
          }

          const ok = Number(chosenOriginalIndex) === Number(sq.correctOption);
          resp.isCorrect = ok;
          resp.marksObtained = ok ? (sq.credit || 0) : 0;
          total += resp.marksObtained || 0;
        } else {
          resp.marksObtained = Number(resp.marksObtained || 0);
          total += resp.marksObtained || 0;
        }
      });
      answer.passageResponses = Array.from(responseMap.values());
      answer.marksObtained = total;
    }
  });

  this.totalMarksPossible = this.answers.reduce((sum, ans) => {
    if (!ans.question) return sum;
    if (ans.question.type === 'passage') {
      const subTotal = (ans.question.subQuestions || []).reduce(
        (s, sq) => s + (sq.credit || 0),
        0
      );
      return sum + subTotal;
    }
    return sum + (ans.question.credit || 0);
  }, 0);

  this.totalMarksObtained = this.answers.reduce((sum, ans) => sum + (ans.marksObtained || 0), 0);

  this.percentage = this.totalMarksPossible > 0
    ? (this.totalMarksObtained / this.totalMarksPossible) * 100
    : 0;

  const exam = await mongoose.model('Exam').findById(this.exam);
  if (exam && exam.totalMarks > 0) {
    this.percentage = (this.totalMarksObtained / exam.totalMarks) * 100;
  } else {
    this.percentage = 0;
  }
};

module.exports = mongoose.model('ExamAttempt', examAttemptSchema);
