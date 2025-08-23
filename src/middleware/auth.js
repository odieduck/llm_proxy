const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      logger.warn('Invalid token attempt', { ip: req.ip, token: token.substring(0, 20) + '...' });
      return res.status(403).json({ error: 'Invalid token' });
    }
    
    req.user = user;
    next();
  });
};

module.exports = { authenticateToken };