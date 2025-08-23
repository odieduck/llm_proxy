const dynamoDBService = require('../config/dynamodb');
const { logger } = require('../utils/logger');

const checkSubscription = async (req, res, next) => {
  try {
    const user = await dynamoDBService.getUserById(req.user.userId) || 
                 await dynamoDBService.getUserByEmail(req.user.email);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!dynamoDBService.canMakeRequest(user)) {
      return res.status(429).json({ 
        error: 'Usage limit exceeded',
        message: 'Your current plan limits have been reached. Please upgrade your subscription.',
        upgradeUrl: '/subscription/plans'
      });
    }

    req.dbUser = user;
    next();
  } catch (error) {
    logger.error('Subscription check error:', error);
    res.status(500).json({ error: 'Subscription validation failed' });
  }
};

const requireActivePlan = (minPlan = 'free') => {
  const planHierarchy = { free: 0, pro: 1, enterprise: 2 };
  
  return async (req, res, next) => {
    try {
      const user = req.dbUser || await dynamoDBService.getUserById(req.user.userId);

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      const userPlanLevel = planHierarchy[user.subscription.plan] || 0;
      const requiredPlanLevel = planHierarchy[minPlan] || 0;

      if (userPlanLevel < requiredPlanLevel) {
        return res.status(403).json({
          error: 'Insufficient subscription plan',
          message: `This feature requires ${minPlan} plan or higher`,
          currentPlan: user.subscription.plan,
          requiredPlan: minPlan,
          upgradeUrl: '/subscription/plans'
        });
      }

      if (!dynamoDBService.hasActiveSubscription(user) && user.subscription.plan !== 'free') {
        return res.status(403).json({
          error: 'Subscription expired',
          message: 'Your subscription has expired. Please renew to continue.',
          renewUrl: '/subscription/renew'
        });
      }

      req.dbUser = user;
      next();
    } catch (error) {
      logger.error('Plan validation error:', error);
      res.status(500).json({ error: 'Plan validation failed' });
    }
  };
};

const trackUsage = async (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    originalSend.call(this, data);
    
    if (res.statusCode === 200 && req.dbUser) {
      const tokens = req.llmResponse?.usage?.total_tokens || 0;
      
      // Increment usage in DynamoDB
      dynamoDBService.incrementUsage(req.dbUser.userId, tokens).catch(error => {
        logger.error('Usage tracking error:', error);
      });

      // Log detailed API usage
      dynamoDBService.logApiUsage(req.dbUser.userId, {
        provider: req.body?.provider || req.query?.provider,
        model: req.body?.model || req.query?.model,
        tokensUsed: tokens,
        cost: calculateCost(req.body?.provider || req.query?.provider, tokens)
      }).catch(error => {
        logger.error('API usage logging error:', error);
      });
    }
  };
  
  next();
};

const calculateCost = (provider, tokens) => {
  const pricing = {
    openai: { input: 0.03 / 1000, output: 0.06 / 1000 },
    anthropic: { input: 0.025 / 1000, output: 0.075 / 1000 },
    bedrock: { input: 0.02 / 1000, output: 0.05 / 1000 }
  };
  
  const rate = pricing[provider?.toLowerCase()] || pricing.openai;
  return (tokens * rate.input).toFixed(6);
};

module.exports = {
  checkSubscription,
  requireActivePlan,
  trackUsage
};