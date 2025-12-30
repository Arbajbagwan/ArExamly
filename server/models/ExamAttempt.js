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
  });

  this.totalMarksPossible = this.answers.reduce(
    (sum, ans) => sum + (ans.question?.credit || 0),
    0
  );

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