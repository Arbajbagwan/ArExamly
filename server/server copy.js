const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const morgan = require('morgan');
const path = require('path');

const connectDB = require('./config/db');
const { initRedis, getRedis } = require('./config/redisClient');

dotenv.config();
connectDB();

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(hpp());

initRedis().catch(() => {});

const rateLimitConfig = {
  windowMs: 10 * 60 * 1000,
  max: 200000
};

try {
  const RedisStore = require('rate-limit-redis');
  const redis = getRedis();
  if (redis) {
    rateLimitConfig.store = new RedisStore({
      sendCommand: (...args) => redis.call(...args)
    });
    console.log('Rate limiter using Redis store');
  }
} catch (_) {
  // Optional dependency not installed: fallback to in-memory store.
}

app.use('/api', rateLimit(rateLimitConfig));


app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/subjects', require('./routes/subjectRoutes'));
app.use('/api/questions', require('./routes/questionRoutes'));
app.use('/api/passages', require('./routes/passageRoutes'));
app.use('/api/exams', require('./routes/examRoutes'));
app.use('/api/attempts', require('./routes/attemptRoutes'));

const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

const PORT = process.env.PORT || 5011;
const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err.message);
  server.close(() => process.exit(1));
});
