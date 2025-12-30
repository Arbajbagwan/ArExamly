const User = require('../models/User');
const { parseExamineesExcel } = require('../utils/excelParser');
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
    const { firstname, lastname, email, isActive } = req.body;

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
    if (lastname) user.lastname = lastname;
    if (email) user.email = email;
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

// @desc    Bulk create examinees from Excel
// @route   POST /api/users/bulk-upload
// @access  Private (SuperUser)
// BEST METHOD: insertMany + ordered: false
exports.bulkCreateExaminees = async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Please upload an Excel file' });
  }

  try {
    const parseResult = await parseExamineesExcel(req.file.path);

    if (!parseResult.success) {
      await fs.unlink(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Invalid Excel format',
        errors: parseResult.errors
      });
    }

    const usersToCreate = parseResult.data.map(row => ({
      firstname: row.firstname.trim(),
      lastname: row.lastname.trim(),
      username: row.username.toLowerCase().trim(),
      email: row.email?.toLowerCase().trim(),
      password: row.password,
      role: 'examinee',
      createdBy: req.user._id,
      isActive: true
    }));

    // FASTEST: Bulk insert, skip duplicates
    const result = await User.insertMany(usersToCreate, {
      ordered: false,  // Continue even if one fails
      rawResult: true
    });

    // Count successes
    const insertedCount = result.insertedIds ? Object.keys(result.insertedIds).length : 0;
    const duplicateCount = usersToCreate.length - insertedCount;

    // Cleanup
    await fs.unlink(req.file.path);

    res.status(201).json({
      success: true,
      message: `Bulk upload completed!`,
      created: insertedCount,
      skipped: duplicateCount,
      total: usersToCreate.length,
      tip: duplicateCount > 0 ? 'Skipped rows had duplicate username/email' : 'All users created!'
    });

  } catch (error) {
    console.error('Bulk upload error:', error);
    try { await fs.unlink(req.file.path); } catch { }

    res.status(500).json({
      success: false,
      message: 'Server error during upload',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
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