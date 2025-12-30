const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  console.error('Error:', err);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    return res.status(404).json({ success: false, message });
  }

  // Mongoose duplicate key - SMART HANDLING
  if (err.code === 11000) {
    // If it's a duplicate exam attempt (exam + examinee), treat as normal
    if (err.message.includes('exam_1_examinee_1') || err.message.includes('exam_1_examinee_1')) {
      // This is expected when resuming exam → don't show error
      return res.status(200).json({
        success: true,
        message: 'Resuming your exam...',
        // Let frontend handle as normal flow
      });
    }

    // Other duplicates (username/email)
    const field = err.message.includes('username') ? 'Username' : 'Email';
    const message = `${field} already exists`;
    return res.status(400).json({ success: false, message });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(val => val.message);
    return res.status(400).json({ success: false, message: messages.join(', ') });
  }

  // Default error
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;