const User = require('../models/User');
const { parseExamineesExcel } = require('../utils/excelParser');
const { createJob, updateJob, getJob, canAccessJob } = require('../utils/uploadJobStore');
const fs = require('fs').promises;

// @desc    Get all users (filtered by role)
// @route   GET /api/users
// @access  Private (Admin/SuperUser)
exports.getUsers = async (req, res, next) => {
  try {
    let filter = {};
    // isActive: true --- for deactivate hide

    // Admin can see superusers, SuperUser can see examinees
    if (req.user.role === 'admin') {
      filter.role = 'superuser';
    } else if (req.user.role === 'superuser') {
      filter.role = 'examinee';
      filter.createdBy = req.user._id; // Only see examinees they created
    }

    const users = await User.find(filter)
      .select('-password')
      .sort('-createdAt');

    res.status(200).json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private (Admin/SuperUser)
exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Authorization check
    if (req.user.role === 'superuser' && user.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this user'
      });
    }

    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private (Admin/SuperUser)
exports.updateUser = async (req, res, next) => {
  try {
    const { firstname, lastname, sbu, group, email, username, password, isActive } = req.body;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Authorization check
    if (req.user.role === 'superuser' && user.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this user'
      });
    }

    // Update fields
    if (firstname) user.firstname = firstname;
    if (lastname !== undefined) user.lastname = lastname;
    if (sbu !== undefined) user.sbu = sbu;
    if (group !== undefined) user.group = group;
    if (email) user.email = email;
    if (username) user.username = username;
    if (password) user.password = password;
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private (Admin/SuperUser)
exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Authorization check
    if (req.user.role === 'superuser' && user.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this user'
      });
    }

    user.isActive = false;
    await user.save();
    // for permanent deletion, use: await user.deleteOne();

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Bulk Delete user
// @route   DELETE /api/users/bulk-delete
// @access  Private (Admin/SuperUser)
exports.bulkDeleteUsers = async (req, res) => {
  const { userIds } = req.body;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ message: 'No users selected' });
  }

  // Prevent self delete
  if (userIds.includes(req.user._id.toString())) {
    return res.status(400).json({ message: 'Cannot delete yourself' });
  }

  const filter = { _id: { $in: userIds } };

  // 🔒 Apply same authorization logic
  if (req.user.role === 'superuser') {
    filter.createdBy = req.user._id;
    filter.role = 'examinee';
  }

  const result = await User.updateMany(
    filter,
    { $set: { isActive: false } }
  );

  // for permanent deletion, use: const result = await User.deleteMany(filter);

  res.json({
    success: true,
    message: `${result.modifiedCount} users deleted`
  });
};

// @desc    Activate multiple users
// @route   POST /api/users/bulk-activate
// @access  Private (Admin/SuperUser)
exports.bulkActivateUsers = async (req, res) => {
  const { userIds } = req.body;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ message: 'No users selected' });
  }

  const filter = { _id: { $in: userIds } };

  // 🔒 Same authorization rules
  if (req.user.role === 'superuser') {
    filter.createdBy = req.user._id;
    filter.role = 'examinee';
  }

  const result = await User.updateMany(
    filter,
    { $set: { isActive: true } }
  );

  res.json({
    success: true,
    message: `${result.modifiedCount} users activated`
  });
};

const processExamineeBulkUpload = async ({ filePath, userId }) => {
  const parseResult = await parseExamineesExcel(filePath);

  if (!parseResult.success) {
    return {
      success: false,
      message: 'Invalid Excel format',
      errors: parseResult.errors || []
    };
  }

  const normalizedRows = parseResult.data.map((row, index) => ({
    index,
    firstname: row.firstname.trim(),
    lastname: row.lastname.trim(),
    sbu: row.sbu ? row.sbu.trim() : '',
    group: row.group ? row.group.trim() : '',
    username: row.username.toLowerCase().trim(),
    email: row.email?.toLowerCase().trim() || '',
    password: row.password,
    role: 'examinee',
    createdBy: userId,
    isActive: true
  }));

  const duplicateDetails = [];
  const seenUsernames = new Set();
  const seenEmails = new Set();
  const candidateRows = [];

  for (const row of normalizedRows) {
    const reasons = [];

    if (seenUsernames.has(row.username)) {
      reasons.push('duplicate username in uploaded file');
    } else {
      seenUsernames.add(row.username);
    }

    if (row.email) {
      if (seenEmails.has(row.email)) {
        reasons.push('duplicate email in uploaded file');
      } else {
        seenEmails.add(row.email);
      }
    }

    if (reasons.length > 0) {
      duplicateDetails.push({
        row: row.index + 2,
        username: row.username,
        email: row.email || '',
        reason: reasons.join(', ')
      });
      continue;
    }

    candidateRows.push(row);
  }

  const usernames = candidateRows.map((row) => row.username);
  const emails = candidateRows.map((row) => row.email).filter(Boolean);

  const existingUsers = await User.find({
    $or: [
      ...(usernames.length > 0 ? [{ username: { $in: usernames } }] : []),
      ...(emails.length > 0 ? [{ email: { $in: emails } }] : [])
    ]
  }).select('username email');

  const existingUsernames = new Set(existingUsers.map((user) => String(user.username || '').toLowerCase()));
  const existingEmails = new Set(existingUsers.map((user) => String(user.email || '').toLowerCase()).filter(Boolean));

  const usersToCreate = [];

  for (const row of candidateRows) {
    const reasons = [];

    if (existingUsernames.has(row.username)) {
      reasons.push('username already exists');
    }

    if (row.email && existingEmails.has(row.email)) {
      reasons.push('email already exists');
    }

    if (reasons.length > 0) {
      duplicateDetails.push({
        row: row.index + 2,
        username: row.username,
        email: row.email || '',
        reason: reasons.join(', ')
      });
      continue;
    }

    usersToCreate.push({
      firstname: row.firstname,
      lastname: row.lastname,
      sbu: row.sbu || undefined,
      group: row.group || undefined,
      username: row.username,
      email: row.email || undefined,
      password: row.password,
      role: row.role,
      createdBy: row.createdBy,
      isActive: row.isActive
    });
  }

  let insertedCount = 0;
  if (usersToCreate.length > 0) {
    const insertedUsers = await User.insertMany(usersToCreate, {
      ordered: true
    });
    insertedCount = insertedUsers.length;
  }

  return {
    success: true,
    message: 'Bulk upload completed!',
    created: insertedCount,
    skipped: duplicateDetails.length,
    total: normalizedRows.length,
    tip: duplicateDetails.length > 0 ? 'Skipped rows had duplicate username/email' : 'All users created!',
    skippedRows: duplicateDetails.slice(0, 50)
  };
};

// @desc    Queue bulk create examinees from Excel
// @route   POST /api/users/bulk-upload
// @access  Private (SuperUser)
exports.startBulkCreateExaminees = async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Please upload an Excel file' });
  }

  try {
    const jobId = createJob({ type: 'users', ownerId: req.user._id });
    updateJob(jobId, { status: 'processing' });

    const filePath = req.file.path;
    const userId = req.user._id;

    setImmediate(async () => {
      try {
        const result = await processExamineeBulkUpload({ filePath, userId });
        updateJob(jobId, {
          status: result.success ? 'completed' : 'failed',
          result,
          error: result.success ? null : result.message
        });
      } catch (error) {
        updateJob(jobId, {
          status: 'failed',
          error: error.message,
          result: {
            success: false,
            message: error.message || 'Server error during upload'
          }
        });
      } finally {
        await fs.unlink(filePath).catch(() => {});
      }
    });

    return res.status(202).json({
      success: true,
      message: 'Upload accepted. Processing in background.',
      jobId,
      status: 'processing'
    });
  } catch (error) {
    console.error('Bulk upload error:', error);
    try { await fs.unlink(req.file.path); } catch {}

    return res.status(500).json({
      success: false,
      message: error.message || 'Server error during upload',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get examinee bulk upload job status
// @route   GET /api/users/bulk-upload/:jobId
// @access  Private (Admin/SuperUser)
exports.getBulkCreateExamineesStatus = async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, message: 'Job not found' });
  }

  if (!canAccessJob(job, req.user)) {
    return res.status(403).json({ success: false, message: 'Not authorized to access this job' });
  }

  return res.status(200).json({
    success: true,
    jobId: job.id,
    type: job.type,
    status: job.status,
    result: job.result,
    error: job.error
  });
};

// @desc    Reset user password
// @route   PUT /api/users/:id/reset-password
// @access  Private (Admin/SuperUser)
exports.resetPassword = async (req, res, next) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide new password'
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Authorization check
    if (req.user.role === 'superuser' && user.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to reset password for this user'
      });
    }

    user.password = newPassword;
    user.passwordChangedAt = Date.now();
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    next(error);
  }
};
