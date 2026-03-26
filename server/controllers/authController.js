const User = require('../models/User');
const { sendTokenResponse } = require('../utils/jwtUtils');
const crypto = require('crypto');

// @desc    Register user (Admin creates SuperUser, SuperUser creates Examinee)
// @route   POST /api/auth/register
// @access  Private (Admin/SuperUser)
exports.register = async (req, res, next) => {
  try {
    const { firstname, lastname, sbu, group, username, email, password, role } = req.body;

    // Role-based creation validation
    if (req.user.role === 'admin' && role !== 'superuser') {
      return res.status(403).json({
        success: false,
        message: 'Admin can only create Super Users'
      });
    }

    if (req.user.role === 'superuser' && role !== 'examinee') {
      return res.status(403).json({
        success: false,
        message: 'Super User can only create Examinees'
      });
    }

    const user = await User.create({
      firstname,
      lastname,
      sbu,
      group,
      username,
      email,
      password,
      role,
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: user._id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide credentials'
      });
    }

    // Check for user
    const user = await User.findOne({ username }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Account not found'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // CHECK FOR ACTIVE SESSION (Take Over Logic)
    let message = 'Login successful';

    if (user.role === 'examinee') {
      if (user.sessionToken) {
        // User was logged in elsewhere
        message = 'You have taken over the session from another device. The previous device has been logged out.';
      }
    }

    // GENERATE NEW TOKEN (Only for Examinee)
    let sessionToken = null;
    if (user.role === 'examinee') {
      sessionToken = crypto.randomBytes(16).toString('hex');
      user.sessionToken = sessionToken;
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    // Send token response
    // We modify sendTokenResponse slightly or send manually to include sessionToken
    const token = require('../utils/jwtUtils').generateToken(user._id);
    const options = {
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none'
    };

    return res.status(200)
      .cookie('jwt', token, options)
      .json({
        success: true,
        token,
        user: {
          _id: user._id,
          username: user.username,
          role: user.role,
          firstname: user.firstname,
          lastname: user.lastname
        },
        sessionToken // Frontend stores this in localStorage
      });
  } catch (error) {
    next(error);
  }
};

// @desc    Check Session Validity
// @route   POST /api/auth/check-session
// @access  Private
exports.checkSession = async (req, res) => {
  try {
    const { sessionToken } = req.body;

    // Admin/SuperUser don't need checks
    if (req.user.role !== 'examinee') {
      return res.status(200).json({ success: true });
    }

    const user = await User.findById(req.user._id).select('+sessionToken');

    if (user.sessionToken !== sessionToken) {
      return res.status(401).json({
        success: false,
        message: 'Logged in on another device'
      });
    }

    res.status(200).json({ success: true });
  } catch (error) { next(error); }
};

// @desc    Logout user / clear cookie
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  try {
    res.cookie('jwt', 'none', {
      expires: new Date(Date.now() + 10 * 1000),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none'
    });

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:5173');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id).select('+password');

    // Check current password
    const isMatch = await user.comparePassword(currentPassword);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    user.password = newPassword;
    user.passwordChangedAt = Date.now();
    user.sessionToken = null; // Invalidate sessions on password change
    await user.save();

    res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:5173');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    const token = require('../utils/jwtUtils').generateToken(user._id);
    res.cookie('jwt', token, { httpOnly: true }).json({ success: true, token, user });
  } catch (error) {
    next(error);
  }
};
