const { logger } = require('../utils/logger');

const requireEmailVerification = (req, res, next) => {
  // Check if email verification is required
  const requireVerification = process.env.REQUIRE_EMAIL_VERIFICATION === 'true';
  
  if (!requireVerification) {
    return next();
  }

  // Check if user is authenticated
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'Please login to access this resource.'
    });
  }

  // Check if email is verified
  if (!req.user.emailVerified) {
    logger.warn('API access denied - email not verified', { 
      userId: req.user.userId, 
      email: req.user.email 
    });
    
    return res.status(403).json({
      error: 'Email verification required',
      message: 'Please verify your email address to access API features.',
      emailVerified: false,
      verificationRequired: true,
      helpText: 'Check your inbox for a verification email, or request a new one.'
    });
  }

  next();
};

const optionalEmailVerification = (req, res, next) => {
  // Add email verification info to response headers for optional endpoints
  if (req.user && !req.user.emailVerified) {
    res.set('X-Email-Verification-Required', 'true');
    res.set('X-Email-Verified', 'false');
  } else if (req.user) {
    res.set('X-Email-Verified', 'true');
  }
  
  next();
};

module.exports = {
  requireEmailVerification,
  optionalEmailVerification
};