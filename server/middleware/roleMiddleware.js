exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action'
      });
    }
    next();
  };
};

// Specific role checks
exports.isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

exports.isSuperUser = (req, res, next) => {
  if (req.user.role !== 'superuser' && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Super User access required'
    });
  }
  next();
};

exports.isExaminee = (req, res, next) => {
  if (req.user.role !== 'examinee') {
    return res.status(403).json({
      success: false,
      message: 'Examinee access required'
    });
  }
  next();
};