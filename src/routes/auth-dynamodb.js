const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const passport = require('../config/passport');
const dynamoDBService = require('../config/dynamodb');
const emailService = require('../utils/email');
const { logger } = require('../utils/logger');

const router = express.Router();

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  username: Joi.string().alphanum().min(3).max(30).optional(),
  password: Joi.string().min(6).required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const generateToken = (user) => {
  return jwt.sign(
    { 
      userId: user.userId,
      username: user.username,
      email: user.email,
      role: user.role,
      subscription: {
        plan: user.subscription.plan,
        status: user.subscription.status,
        expires: user.subscription.endDate
      }
    },
    process.env.JWT_SECRET,
    { expiresIn: `${process.env.SESSION_TIMEOUT_HOURS || 5}h` } // Match session timeout
  );
};

router.post('/register', async (req, res, next) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, username, password } = value;

    // Check if user already exists
    const existingUser = await dynamoDBService.getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await dynamoDBService.createUser({
      email,
      username,
      password: hashedPassword,
      role: 'user'
    });

    // Generate email verification token
    const verificationToken = emailService.generateVerificationToken();
    const tokenExpires = emailService.getTokenExpiration(24); // 24 hours

    // Store verification token in database
    await dynamoDBService.setEmailVerificationToken(email, verificationToken, tokenExpires);

    // Send verification email
    const emailResult = await emailService.sendVerificationEmail(email, verificationToken, username);
    
    const token = generateToken(user);
    logger.info('User registered', { userId: user.userId, email, emailVerificationSent: emailResult.success });
    
    res.status(201).json({ 
      message: 'User registered successfully. Please check your email to verify your account.',
      token,
      emailVerificationRequired: true,
      emailVerified: false,
      user: {
        id: user.userId,
        email: user.email,
        username: user.username,
        emailVerified: false,
        subscription: user.subscription
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password } = value;
    const user = await dynamoDBService.getUserByEmail(email);

    if (!user || !user.password || !await bcrypt.compare(password, user.password)) {
      logger.warn('Failed login attempt', { email, ip: req.ip });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await dynamoDBService.updateUserLogin(email);

    const token = generateToken(user);
    logger.info('User logged in', { userId: user.userId, email });
    
    res.json({ 
      token,
      user: {
        id: user.userId,
        email: user.email,
        username: user.username,
        emailVerified: user.emailVerified || false,
        subscription: user.subscription
      }
    });
  } catch (error) {
    next(error);
  }
});

// Email verification routes
router.get('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    const user = await dynamoDBService.verifyEmailToken(token);

    if (!user) {
      return res.status(400).json({ 
        error: 'Invalid or expired verification token',
        message: 'Please request a new verification email.'
      });
    }

    logger.info('Email verified successfully', { userId: user.userId, email: user.email });
    
    res.json({
      message: 'Email verified successfully! You can now use all features.',
      user: {
        id: user.userId,
        email: user.email,
        username: user.username,
        emailVerified: true
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/resend-verification', async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await dynamoDBService.resendVerificationEmail(email);

    // Generate new verification token
    const verificationToken = emailService.generateVerificationToken();
    const tokenExpires = emailService.getTokenExpiration(24); // 24 hours

    // Update verification token in database
    await dynamoDBService.setEmailVerificationToken(email, verificationToken, tokenExpires);

    // Send verification email
    const emailResult = await emailService.sendVerificationEmail(email, verificationToken, user.username);

    logger.info('Verification email resent', { email, success: emailResult.success });

    res.json({
      message: 'Verification email sent! Please check your inbox.',
      success: emailResult.success
    });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ error: 'User not found' });
    }
    if (error.message === 'Email already verified') {
      return res.status(400).json({ error: 'Email is already verified' });
    }
    next(error);
  }
});

// Check email verification status
router.get('/verification-status', async (req, res, next) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await dynamoDBService.getUserByEmail(email);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      email: user.email,
      emailVerified: user.emailVerified || false,
      verificationRequired: !user.emailVerified
    });
  } catch (error) {
    next(error);
  }
});

// Google OAuth routes
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

router.get('/google/callback', 
  passport.authenticate('google', { session: false }),
  async (req, res) => {
    try {
      const token = generateToken(req.user);
      const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/auth/success?token=${token}`;
      res.redirect(redirectUrl);
    } catch (error) {
      logger.error('Google callback error:', error);
      const errorUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/auth/error`;
      res.redirect(errorUrl);
    }
  }
);

// Apple OAuth routes
router.get('/apple', passport.authenticate('apple'));

router.post('/apple/callback',
  passport.authenticate('apple', { session: false }),
  async (req, res) => {
    try {
      const token = generateToken(req.user);
      res.json({ 
        success: true,
        token,
        user: {
          id: req.user.userId,
          email: req.user.email,
          subscription: req.user.subscription
        }
      });
    } catch (error) {
      logger.error('Apple callback error:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  }
);

// Get current user profile
router.get('/me', async (req, res, next) => {
  try {
    // This would need JWT middleware to extract user info
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await dynamoDBService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.userId,
        email: user.email,
        username: user.username,
        subscription: user.subscription,
        socialProviders: user.socialProviders?.map(p => ({
          provider: p.provider,
          name: p.name
        })) || []
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;