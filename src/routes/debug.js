const express = require('express');
const router = express.Router();

// Debug endpoint to check environment and services
router.get('/env', (req, res) => {
  res.json({
    NODE_ENV: process.env.NODE_ENV,
    AWS_REGION: process.env.AWS_REGION,
    JWT_SECRET: process.env.JWT_SECRET ? 'SET' : 'MISSING',
    SESSION_SECRET: process.env.SESSION_SECRET ? 'SET' : 'MISSING',
    DYNAMODB_USERS_TABLE: process.env.DYNAMODB_USERS_TABLE,
    DYNAMODB_SESSIONS_TABLE: process.env.DYNAMODB_SESSIONS_TABLE,
    DYNAMODB_USAGE_TABLE: process.env.DYNAMODB_USAGE_TABLE,
    timestamp: new Date().toISOString()
  });
});

// Test DynamoDB connection
router.get('/dynamodb', async (req, res) => {
  try {
    const dynamoDBService = require('../config/dynamodb');
    
    // Try to list tables or perform a simple operation
    const testUser = {
      email: 'test-connection@example.com',
      username: 'testuser',
      password: 'hashedpassword',
      role: 'user'
    };

    // Just test if we can access the service
    res.json({
      dynamodbService: !!dynamoDBService,
      tables: dynamoDBService.tables,
      timestamp: new Date().toISOString(),
      message: 'DynamoDB service accessible'
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
});

// Test registration flow step by step
router.post('/test-register', async (req, res) => {
  try {
    const Joi = require('joi');
    const bcrypt = require('bcryptjs');
    const dynamoDBService = require('../config/dynamodb');
    
    const registerSchema = Joi.object({
      email: Joi.string().email().required(),
      username: Joi.string().alphanum().min(3).max(30).optional(),
      password: Joi.string().min(6).required()
    });

    console.log('Step 1: Validating input...');
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message, step: 'validation' });
    }

    const { email, username, password } = value;
    console.log('Step 2: Input validated:', { email, username });

    console.log('Step 3: Checking if user exists...');
    const existingUser = await dynamoDBService.getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists', step: 'user_check' });
    }
    console.log('Step 4: User does not exist, proceeding...');

    console.log('Step 5: Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('Step 6: Password hashed');

    console.log('Step 7: Creating user in DynamoDB...');
    const user = await dynamoDBService.createUser({
      email,
      username,
      password: hashedPassword,
      role: 'user'
    });
    console.log('Step 8: User created:', user.userId);

    res.json({
      message: 'Test registration successful',
      userId: user.userId,
      email: user.email,
      steps_completed: 8
    });
  } catch (error) {
    console.error('Test registration error:', error);
    res.status(500).json({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      step: 'unknown'
    });
  }
});

module.exports = router;