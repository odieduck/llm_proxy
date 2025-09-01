const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const dynamoDBService = require('../config/dynamodb');
const iosSubscriptionService = require('../services/iosSubscriptionService');
const { logger } = require('../utils/logger');
const Joi = require('joi');

const router = express.Router();

const receiptValidationSchema = Joi.object({
  receiptData: Joi.string().required(),
  excludeOldTransactions: Joi.boolean().default(false)
});

// Validate iOS App Store receipt and update subscription
router.post('/validate-receipt', authenticateToken, async (req, res, next) => {
  try {
    const { error, value } = receiptValidationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { receiptData } = value;
    const userId = req.user.userId;

    logger.info('iOS receipt validation requested', { userId });

    const subscriptionResult = await iosSubscriptionService.processSubscription(userId, receiptData);
    
    // Get updated user data
    const user = await dynamoDBService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      message: 'Receipt validated successfully',
      data: {
        subscription: subscriptionResult,
        user: {
          id: user.userId,
          subscription: user.subscription
        }
      }
    });

  } catch (error) {
    logger.error('iOS receipt validation error', { 
      userId: req.user.userId, 
      error: error.message 
    });
    next(error);
  }
});

// Get current iOS subscription status
router.get('/status', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    const user = await dynamoDBService.getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const subscription = user.subscription;
    const isIOSSubscription = subscription.platform === 'ios';

    let needsReceiptRefresh = false;
    if (isIOSSubscription && subscription.iosReceiptData) {
      // Check if we need to refresh the receipt (last validation > 24 hours ago)
      const lastValidation = new Date(subscription.iosReceiptData.lastValidationDate);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      needsReceiptRefresh = !subscription.iosReceiptData.lastValidationDate || lastValidation < oneDayAgo;
    }

    res.json({
      success: true,
      data: {
        plan: subscription.plan,
        status: subscription.status,
        platform: subscription.platform,
        expiresDate: subscription.endDate,
        usage: {
          requests: {
            current: subscription.usage.requests.current,
            limit: subscription.usage.requests.limit,
            percentage: subscription.usage.requests.limit > 0 ? 
              (subscription.usage.requests.current / subscription.usage.requests.limit * 100) : 0
          },
          tokens: {
            current: subscription.usage.tokens.current,
            limit: subscription.usage.tokens.limit,
            percentage: subscription.usage.tokens.limit > 0 ? 
              (subscription.usage.tokens.current / subscription.usage.tokens.limit * 100) : 0
          }
        },
        ios: isIOSSubscription ? {
          productId: subscription.iosReceiptData?.productId,
          transactionId: subscription.iosReceiptData?.transactionId,
          lastValidationDate: subscription.iosReceiptData?.lastValidationDate,
          needsReceiptRefresh
        } : null
      }
    });

  } catch (error) {
    next(error);
  }
});

// Refresh iOS subscription status
router.post('/refresh', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const result = await iosSubscriptionService.refreshSubscriptionStatus(userId);
    
    if (!result) {
      return res.status(400).json({ 
        error: 'No iOS subscription found to refresh' 
      });
    }

    res.json({
      success: true,
      message: 'Subscription refresh initiated',
      data: result
    });

  } catch (error) {
    logger.error('iOS subscription refresh error', { 
      userId: req.user.userId, 
      error: error.message 
    });
    next(error);
  }
});

// App Store Server-to-Server Notifications webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const notificationData = JSON.parse(req.body.toString());
    
    logger.info('Received App Store Server Notification', {
      notificationType: notificationData.notification_type,
      environment: notificationData.environment
    });

    await iosSubscriptionService.handleAppStoreServerNotification(notificationData);
    
    res.status(200).send('OK');
  } catch (error) {
    logger.error('App Store webhook processing error', { 
      error: error.message,
      body: req.body?.toString()?.substring(0, 200)
    });
    res.status(400).send('Webhook Error');
  }
});

// Get iOS subscription plans (mapped to App Store product IDs)
router.get('/plans', (req, res) => {
  const plans = iosSubscriptionService.getPlans();
  
  res.json({
    success: true,
    data: {
      plans,
      productIds: {
        pro: {
          monthly: process.env.IOS_PRO_MONTHLY_PRODUCT_ID || 'com.yourapp.pro.monthly',
          yearly: process.env.IOS_PRO_YEARLY_PRODUCT_ID || 'com.yourapp.pro.yearly'
        },
        enterprise: {
          monthly: process.env.IOS_ENTERPRISE_MONTHLY_PRODUCT_ID || 'com.yourapp.enterprise.monthly',
          yearly: process.env.IOS_ENTERPRISE_YEARLY_PRODUCT_ID || 'com.yourapp.enterprise.yearly'
        }
      }
    }
  });
});

// Restore purchases (validate all historical receipts)
router.post('/restore', authenticateToken, async (req, res, next) => {
  try {
    const { receiptData } = req.body;
    
    if (!receiptData) {
      return res.status(400).json({ error: 'Receipt data required' });
    }

    const userId = req.user.userId;
    logger.info('iOS purchase restore requested', { userId });

    const subscriptionResult = await iosSubscriptionService.processSubscription(userId, receiptData);
    
    res.json({
      success: true,
      message: 'Purchases restored successfully',
      data: {
        subscription: subscriptionResult
      }
    });

  } catch (error) {
    logger.error('iOS purchase restore error', { 
      userId: req.user.userId, 
      error: error.message 
    });
    next(error);
  }
});

module.exports = router;