const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['mcq', 'theory', 'passage'],
    required: true
  },
  question: {
    type: String,
    required: true
  },
  options: [{
    type: String
  }],
  correctOption: {
    type: Number,
    required: function() {
      return this.type === 'mcq';
    }
  },
  credit: {
    type: Number,
    required: true,
    min: 0
  },
  // Subject reference
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject'
  },
  // Topic within subject
  topic: {
    type: String,
    default: 'General'
  },
  category: {
    type: String,
    default: 'General'
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  tags: [String],
  explanation: {
    type: String
  },
  subQuestions: [{
    prompt: { type: String, required: true, trim: true },
    type: { type: String, enum: ['mcq', 'theory'], required: true },
    options: [{ type: String }],
    correctOption: { type: Number },
    credit: { type: Number, required: true, min: 0 }
  }],
  passage: {
    title: {
      type: String,
      trim: true
    },
    text: {
      type: String,
      trim: true
    },
    topic: {
      type: String,
      trim: true
    },
    complexity: {
      type: String,
      enum: ['simple', 'moderate', 'complex'],
      default: 'simple'
    },
    marksLabel: {
      type: String,
      trim: true
    }
  },
  passageRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Passage'
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

// Validation: MCQ must have options and correctOption
questionSchema.pre('save', async function() {
  if (this.type === 'mcq') {
    if (!this.options || this.options.length < 2) {
      throw new Error('MCQ must have at least 2 options');
    }
    if (this.correctOption === undefined || this.correctOption >= this.options.length) {
      throw new Error('Invalid correct option index');
    }
  }

  if (this.type === 'passage') {
    if (!this.passageRef) {
      throw new Error('Passage type question must be linked to a passage');
    }
    if (!Array.isArray(this.subQuestions) || this.subQuestions.length === 0) {
      throw new Error('Passage type question must have sub questions');
    }
    for (const sq of this.subQuestions) {
      if (sq.type === 'mcq') {
        if (!sq.options || sq.options.length < 2) {
          throw new Error('Passage MCQ must have at least 2 options');
        }
        if (sq.correctOption === undefined || sq.correctOption >= sq.options.length) {
          throw new Error('Invalid passage MCQ correct option index');
        }
      }
    }
    this.credit = this.subQuestions.reduce((sum, sq) => sum + (sq.credit || 0), 0);
  }
});

// Hot-path index for random question selection in startExam.
questionSchema.index({
  createdBy: 1,
  isActive: 1,
  type: 1,
  subject: 1,
  difficulty: 1
});

module.exports = mongoose.model('Question', questionSchema);
