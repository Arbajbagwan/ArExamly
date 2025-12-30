const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['mcq', 'theory'],
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
});

module.exports = mongoose.model('Question', questionSchema);