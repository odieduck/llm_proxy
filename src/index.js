require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const passport = require('./config/passport');
const { connectDB } = require('./config/database');
const { logger } = require('./utils/logger');
const authRoutes = require('./routes/auth');
const proxyRoutes = require('./routes/proxy');
const subscriptionRoutes = require('./routes/subscription');
const iosSubscriptionRoutes = require('./routes/iosSubscription');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure proxy trust for AWS App Runner
if (process.env.NODE_ENV === 'production') {
  // In production (AWS App Runner), trust first proxy only
  app.set('trust proxy', 1);
} else {
  // In development, no proxy
  app.set('trust proxy', false);
}

// Connect to database
connectDB();

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting with proxy awareness
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip validation warnings since we're handling proxy trust above
  validate: {
    trustProxy: false,
    xForwardedForHeader: false
  }
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session configuration for passport
app.use(session({
  secret: process.env.SESSION_SECRET || process.env.JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/auth', authRoutes);
app.use('/api', proxyRoutes);
app.use('/subscription', subscriptionRoutes);
app.use('/ios', iosSubscriptionRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  logger.info(`LLM Proxy Service running on port ${PORT}`);
});

module.exports = app;