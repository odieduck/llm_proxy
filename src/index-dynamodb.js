require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const passport = require('./config/passport');
const { logger } = require('./utils/logger');
const authRoutes = require('./routes/auth-dynamodb');
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

// Initialize DynamoDB connection test
(async () => {
  try {
    const dynamoDBService = require('./config/dynamodb');
    logger.info('DynamoDB service ready for AWS deployment');
  } catch (error) {
    logger.error('DynamoDB initialization error:', error);
  }
})();

// Security middleware with relaxed CSP for our web interface
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  }
}));
app.use(cors({
  origin: true, // Allow all origins for now
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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

// Static files
app.use(express.static('public'));

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
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: 'DynamoDB',
    region: process.env.AWS_REGION || 'us-east-1'
  });
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  logger.info(`LLM Proxy Service (DynamoDB) running on port ${PORT}`);
});

module.exports = app;