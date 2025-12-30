module.exports = {
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
  JWT_COOKIE_EXPIRE: process.env.JWT_COOKIE_EXPIRE || 7,
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 5000,
  MONGO_URI: process.env.MONGO_URI,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173'
};