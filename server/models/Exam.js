const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide exam title'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  duration: {
    type: Number, // in minutes
    required: [true, 'Please provide exam duration'],
    min: [1, 'Duration must be at least 1 minute']
  },
  minimumAttemptQuestions: {
    type: Number,
    default: 0,
    min: [0, 'Minimum attempted questions cannot be negative']
  },
  totalMarks: {
    type: Number,
    default: 0
  },
  passingMarks: {
    type: Number,
    default: 0,
    min: [0, 'Passing marks cannot be negative']
  },
  instructions: {
    type: String
  },
  customInstructions: [{
    type: String,
    trim: true
  }],
  instructionLink: {
    type: String,
    trim: true
  },
  startAt: {
    type: Date
  },
  endAt: {
    type: Date
  },
  scheduledDate: {
    type: Date,
    required: false
  },
  startTime: {
    type: String,  // Changed from Date to String (e.g., "09:00")
    required: false
  },
  endTime: {
    type: String,  // Changed from Date to String (e.g., "12:00")
    required: false
  },
  questions: [{
    question: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question'
    },
    order: Number
  }],
  assignedTo: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  allowReview: {
    type: Boolean,
    default: true
  },
  selectionMode: {
    type: String,
    enum: ['manual', 'random'],
    default: 'manual'
  },
  randomConfig: {
    totalQuestions: { type: Number, min: 1 },
    mcqCount: { type: Number, min: 0 },
    theoryCount: { type: Number, min: 0 },
    passageCount: { type: Number, min: 0 },

    subjectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'] },
    topic: { type: String }, // optional, you can regex-match in controller

    // shuffle the picked set when generating it
    shuffleSelectedQuestions: { type: Boolean, default: true }
  },
  shuffleQuestions: {
    type: Boolean,
    default: false
  },
  shuffleOptions: {
    type: Boolean,
    default: false
  },
  showResults: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'active', 'completed', 'cancelled'],
    default: 'draft'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Virtual to get full start datetime
examSchema.virtual('startDateTime').get(function () {
  if (this.startAt) return new Date(this.startAt);
  if (this.scheduledDate && this.startTime) {
    const [hours, minutes] = this.startTime.split(':');
    const date = new Date(this.scheduledDate);
    date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    return date;
  }
  return null;
});

// Virtual to get full end datetime
examSchema.virtual('endDateTime').get(function () {
  if (this.endAt) return new Date(this.endAt);
  if (this.scheduledDate && this.endTime) {
    const [hours, minutes] = this.endTime.split(':');
    const date = new Date(this.scheduledDate);
    date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    return date;
  }
  return null;
});

// Calculate total marks from questions
examSchema.methods.calculateTotalMarks = async function () {
  await this.populate('questions.question');
  this.totalMarks = this.questions.reduce((sum, q) => {
    return sum + (q.question?.credit || 0);
  }, 0);
  return this.totalMarks;
};

// Check if exam is currently active
examSchema.methods.isExamActive = function () {
  const now = new Date();
  const startDateTime = this.startDateTime;
  const endDateTime = this.endDateTime;

  if (!startDateTime || !endDateTime) return false;

  return now >= startDateTime && now <= endDateTime;
};

examSchema.pre('validate', function () {
  const hasNewWindow = this.startAt && this.endAt;
  const hasLegacyWindow = this.scheduledDate && this.startTime && this.endTime;

  if (!hasNewWindow && !hasLegacyWindow) {
    throw new Error('Please provide exam start and end time');
  }

  const start = hasNewWindow ? new Date(this.startAt) : this.startDateTime;
  const end = hasNewWindow ? new Date(this.endAt) : this.endDateTime;
  if (start && end && end <= start) {
    throw new Error('Exam end time must be after start time');
  }

  if (this.minimumAttemptQuestions < 0) {
    throw new Error('Minimum attempted questions cannot be negative');
  }

  const configuredQuestionCount =
    this.selectionMode === 'random'
      ? Number(this.randomConfig?.totalQuestions || 0)
      : Array.isArray(this.questions)
        ? this.questions.length
        : 0;

  if (
    Number.isFinite(this.minimumAttemptQuestions) &&
    configuredQuestionCount > 0 &&
    this.minimumAttemptQuestions > configuredQuestionCount
  ) {
    throw new Error('Minimum attempted questions cannot exceed total exam questions');
  }
});

// Include virtuals in JSON
examSchema.set('toJSON', { virtuals: true });
examSchema.set('toObject', { virtuals: true });

// Hot-path indexes used during startExam assignment/time checks and dashboard listing.
examSchema.index({ assignedTo: 1, scheduledDate: 1, status: 1 });
examSchema.index({ createdBy: 1, scheduledDate: -1 });
examSchema.index({ assignedTo: 1, startAt: 1, endAt: 1, status: 1 });
examSchema.index({ createdBy: 1, startAt: -1 });

module.exports = mongoose.model('Exam', examSchema);
