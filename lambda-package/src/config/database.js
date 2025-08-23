const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/llm-proxy';
    
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    };

    const conn = await mongoose.connect(mongoURI, options);
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    
    return conn;
  } catch (error) {
    logger.error('Database connection error:', error);
    logger.warn('Continuing without database for testing purposes');
    return null;
  }
};

module.exports = { connectDB };