const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const passport = require('../config/passport');
const dynamoDBService = require('../config/dynamodb');
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
    { expiresIn: '24h' }
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
    
    const token = generateToken(user);
    logger.info('User registered', { userId: user.userId, email });
    
    res.status(201).json({ 
      message: 'User registered successfully',
      token,
      user: {
        id: user.userId,
        email: user.email,
        username: user.username,
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
        subscription: user.subscription
      }
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