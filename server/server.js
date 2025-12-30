// server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const morgan = require('morgan');
const path = require('path');

// Load env variables
dotenv.config();

// Database connection
const connectDB = require('./config/db');
connectDB();

const app = express();

/* =========================
   CORS
========================= */
app.use(cors({
   origin: process.env.FRONTEND_URL || 'http://localhost:5173',
   credentials: true,
}));

/* =========================
   Body & Cookie Parsers
========================= */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

/* =========================
   Dev Logging
========================= */
if (process.env.NODE_ENV === 'development') {
   app.use(morgan('dev'));
}

/* =========================
   Security Middleware
========================= */
app.use(helmet());
app.use(hpp());

app.use('/api', rateLimit({
   windowMs: 10 * 60 * 1000,
   max: 100,
}));

/* =========================
   Static Files
========================= */
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* =========================
   Routes
========================= */
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/subjects', require('./routes/subjectRoutes'));
app.use('/api/questions', require('./routes/questionRoutes'));
app.use('/api/exams', require('./routes/examRoutes'));
app.use('/api/attempts', require('./routes/attemptRoutes'));

/* =========================
   Error Handler
========================= */
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

/* =========================
   Redis (Only ONE client!)
========================= */
let redis = null;

if (process.env.REDIS_HOST || true) {  // Remove this line in production if you want strict
   try {
      const Redis = require('ioredis');

      redis = new Redis({
         host: process.env.REDIS_HOST || '127.0.0.1',
         port: process.env.REDIS_PORT || 6379,
         password: process.env.REDIS_PASSWORD || undefined,
         retryStrategy: times => {
            // Only retry 3 times, then give up
            if (times > 3) {
               console.log('Redis connection failed after 3 attempts – caching disabled');
               return null; // Stop retrying
            }
            return Math.min(times * 500, 2000); // Retry delay
         },
         maxRetriesPerRequest: 0,
         reconnectOnError: () => false
      });

      redis.on('connect', () => {
         console.log('Redis Connected Successfully');
      });

      redis.on('error', (err) => {
         if (err.code === 'ECONNREFUSED') {
            // Only show once
            if (!redis.connectionFailed) {
               console.log('Redis not running – caching disabled (safe)');
               redis.connectionFailed = true; // Prevent spam
            }
         }
      });

   } catch (err) {
      console.log('Redis disabled (not installed)');
   }
}

// Make it globally available
global.redis = redis;

/* =========================
   Server Start
========================= */
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
   console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

/* =========================
   Unhandled Rejections
========================= */
process.on('unhandledRejection', (err) => {
   console.error('Unhandled Rejection:', err.message);
   server.close(() => process.exit(1));
});