const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRE, JWT_COOKIE_EXPIRE } = require('../config/config');

exports.generateToken = (id) => {
  return jwt.sign({ id }, JWT_SECRET, {
    expiresIn: JWT_EXPIRE
  });
};

exports.sendTokenResponse = (user, statusCode, res) => {
  const token = this.generateToken(user._id);

  const options = {
    expires: new Date(Date.now() + JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  };

  // Remove password from output
  user.password = undefined;

  res
    .status(statusCode)
    .cookie('jwt', token, options)
    .json({
      success: true,
      token,
      user
    });
};