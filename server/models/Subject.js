const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide subject name'],
    unique: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  code: {
    type: String,
    unique: true,
    sparse: true,
    uppercase: true,
    trim: true
  },
  color: {
    type: String,
    default: '#3B82F6'
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

// Generate code from name if not provided
subjectSchema.pre('save', async function() {
  if (!this.code) {
    this.code = this.name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 5);
  }
});

module.exports = mongoose.model('Subject', subjectSchema);