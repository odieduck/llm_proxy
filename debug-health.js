// Simple health check with detailed error logging
require('dotenv').config();

console.log('=== Environment Debug Info ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('AWS_REGION:', process.env.AWS_REGION);
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'SET' : 'MISSING');
console.log('SESSION_SECRET:', process.env.SESSION_SECRET ? 'SET' : 'MISSING');
console.log('DYNAMODB_USERS_TABLE:', process.env.DYNAMODB_USERS_TABLE);
console.log('DYNAMODB_SESSIONS_TABLE:', process.env.DYNAMODB_SESSIONS_TABLE);
console.log('DYNAMODB_USAGE_TABLE:', process.env.DYNAMODB_USAGE_TABLE);
console.log('==============================');

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Simple health check without dependencies
app.get('/health', (req, res) => {
  try {
    console.log('Health check requested');
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV,
      region: process.env.AWS_REGION || 'not-set'
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ error: 'Health check failed', message: error.message });
  }
});

// Debug endpoint
app.get('/debug', (req, res) => {
  res.json({
    env_vars: {
      NODE_ENV: process.env.NODE_ENV,
      AWS_REGION: process.env.AWS_REGION,
      JWT_SECRET_SET: !!process.env.JWT_SECRET,
      SESSION_SECRET_SET: !!process.env.SESSION_SECRET,
      DYNAMODB_TABLES: {
        users: process.env.DYNAMODB_USERS_TABLE,
        sessions: process.env.DYNAMODB_SESSIONS_TABLE,
        usage: process.env.DYNAMODB_USAGE_TABLE
      }
    },
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`Debug server running on port ${PORT}`);
});

module.exports = app;