const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const subscriptionService = require('../services/subscriptionService');
const dynamoDBService = require('../config/dynamodb');
const { logger } = require('../utils/logger');

const router = express.Router();

// Get available subscription plans
router.get('/plans', (req, res) => {
  const plans = subscriptionService.getPlans();
  res.json({
    success: true,
    data: plans
  });
});

// Get user's current subscription status and usage
router.get('/status', authenticateToken, async (req, res, next) => {
  try {
    const user = await dynamoDBService.getUserById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const usage = await subscriptionService.getUserUsage(user._id);
    res.json({
      success: true,
      data: usage
    });
  } catch (error) {
    next(error);
  }
});

// Create new subscription
router.post('/create', authenticateToken, async (req, res, next) => {
  try {
    const { plan } = req.body;
    
    if (!plan || !['pro', 'enterprise'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan selected' });
    }

    const user = await dynamoDBService.getUserById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await subscriptionService.createSubscription(user._id, plan);
    
    res.json({
      success: true,
      message: 'Subscription created successfully',
      data: {
        subscription: result.subscription,
        user: {
          id: result.user._id,
          subscription: result.user.subscription
        }
      }
    });
  } catch (error) {
    logger.error('Subscription creation error:', error);
    next(error);
  }
});

// Cancel subscription
router.post('/cancel', authenticateToken, async (req, res, next) => {
  try {
    const user = await dynamoDBService.getUserById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = await subscriptionService.cancelSubscription(user._id);
    
    res.json({
      success: true,
      message: 'Subscription cancelled successfully',
      data: {
        subscription: updatedUser.subscription
      }
    });
  } catch (error) {
    logger.error('Subscription cancellation error:', error);
    next(error);
  }
});

// Get usage statistics
router.get('/usage', authenticateToken, async (req, res, next) => {
  try {
    const user = await dynamoDBService.getUserById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { days = 30 } = req.query;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const recentUsage = user.apiUsage.filter(usage => usage.date >= startDate);
    
    const stats = {
      totalRequests: recentUsage.length,
      totalTokens: recentUsage.reduce((sum, usage) => sum + usage.tokensUsed, 0),
      totalCost: recentUsage.reduce((sum, usage) => sum + usage.cost, 0),
      byProvider: {},
      byModel: {},
      dailyUsage: {}
    };

    recentUsage.forEach(usage => {
      const provider = usage.provider || 'unknown';
      const model = usage.model || 'unknown';
      const day = usage.date.toISOString().split('T')[0];

      stats.byProvider[provider] = (stats.byProvider[provider] || 0) + 1;
      stats.byModel[model] = (stats.byModel[model] || 0) + 1;
      stats.dailyUsage[day] = (stats.dailyUsage[day] || 0) + 1;
    });

    res.json({
      success: true,
      data: {
        period: `${days} days`,
        stats,
        currentPlan: user.subscription.plan,
        limits: user.getUsageLimits()
      }
    });
  } catch (error) {
    next(error);
  }
});

// Stripe webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      return res.status(400).send('Webhook secret not configured');
    }

    const event = require('stripe')(process.env.STRIPE_SECRET_KEY).webhooks.constructEvent(
      req.body,
      sig,
      webhookSecret
    );

    await subscriptionService.handleWebhook(event);
    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook error:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

module.exports = router;