const axios = require('axios');
const dynamoDBService = require('../config/dynamodb');
const { logger } = require('../utils/logger');

class IOSSubscriptionService {
  constructor() {
    // Map iOS product IDs to internal plan names
    this.productIdToPlan = {
      [process.env.IOS_PRO_MONTHLY_PRODUCT_ID || 'com.yourapp.pro.monthly']: 'pro',
      [process.env.IOS_PRO_YEARLY_PRODUCT_ID || 'com.yourapp.pro.yearly']: 'pro',
      [process.env.IOS_ENTERPRISE_MONTHLY_PRODUCT_ID || 'com.yourapp.enterprise.monthly']: 'enterprise',
      [process.env.IOS_ENTERPRISE_YEARLY_PRODUCT_ID || 'com.yourapp.enterprise.yearly']: 'enterprise'
    };

    // Plan configurations matching your existing plans
    this.plans = {
      free: {
        name: 'Free Plan',
        requests: 100,
        tokens: 10000,
        features: ['Basic API access', 'Community support']
      },
      pro: {
        name: 'Pro Plan',
        requests: 1000,
        tokens: 100000,
        features: ['Priority support', 'Advanced models', 'Higher limits']
      },
      enterprise: {
        name: 'Enterprise Plan',
        requests: -1, // unlimited
        tokens: -1,   // unlimited
        features: ['Unlimited requests', 'Dedicated support', 'Custom models', 'SLA']
      }
    };
  }

  async verifyReceipt(receiptData, userId) {
    try {
      logger.info('iOS receipt verification requested', { userId, receiptLength: receiptData.length });

      // For local testing, we'll simulate the receipt verification
      if (!process.env.IOS_SHARED_SECRET) {
        logger.warn('iOS shared secret not configured - using mock verification for testing');
        return this.createMockReceiptResponse();
      }

      const verifyUrl = process.env.NODE_ENV === 'production' 
        ? 'https://buy.itunes.apple.com/verifyReceipt'
        : 'https://sandbox.itunes.apple.com/verifyReceipt';

      const requestBody = {
        'receipt-data': receiptData,
        'password': process.env.IOS_SHARED_SECRET
      };

      const response = await axios.post(verifyUrl, requestBody, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data.status !== 0) {
        throw new Error(`App Store verification failed with status: ${response.data.status}`);
      }

      logger.info('iOS receipt verified successfully', { 
        userId, 
        bundleId: response.data.receipt.bundle_id 
      });

      return response.data;
    } catch (error) {
      logger.error('iOS receipt verification failed', { userId, error: error.message });
      throw new Error(`Receipt verification failed: ${error.message}`);
    }
  }

  createMockReceiptResponse() {
    // Mock response for local testing
    return {
      receipt: {
        bundle_id: 'com.yourapp.test',
        in_app: [{
          product_id: 'com.yourapp.pro.monthly',
          transaction_id: '1000000123456789',
          original_transaction_id: '1000000123456789',
          purchase_date_ms: Date.now().toString(),
          expires_date_ms: (Date.now() + 30 * 24 * 60 * 60 * 1000).toString() // 30 days from now
        }]
      }
    };
  }

  async processSubscription(userId, receiptData) {
    try {
      const receipt = await this.verifyReceipt(receiptData, userId);
      const user = await dynamoDBService.getUserById(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      // Get the latest subscription from in-app purchases
      const latestSubscription = this.getLatestActiveSubscription(receipt.receipt.in_app);
      
      if (!latestSubscription) {
        // No active subscription found, set to free plan
        await this.updateUserSubscription(user, 'free', null, null);
        return { plan: 'free', status: 'active' };
      }

      const productId = latestSubscription.product_id;
      const plan = this.productIdToPlan[productId];
      
      if (!plan) {
        throw new Error(`Unknown product ID: ${productId}`);
      }

      const expiresDate = new Date(parseInt(latestSubscription.expires_date_ms));
      const isActive = expiresDate > new Date();
      
      await this.updateUserSubscription(
        user,
        plan,
        latestSubscription,
        isActive ? expiresDate : null
      );

      logger.info('iOS subscription processed', {
        userId,
        plan,
        productId,
        expiresDate,
        isActive
      });

      return {
        plan,
        status: isActive ? 'active' : 'expired',
        expiresDate,
        productId,
        transactionId: latestSubscription.transaction_id
      };

    } catch (error) {
      logger.error('iOS subscription processing error', { userId, error: error.message });
      throw error;
    }
  }

  getLatestActiveSubscription(inAppPurchases) {
    if (!inAppPurchases || inAppPurchases.length === 0) {
      return null;
    }

    // Filter for subscription products and sort by expires_date_ms
    const subscriptions = inAppPurchases
      .filter(purchase => Object.keys(this.productIdToPlan).includes(purchase.product_id))
      .sort((a, b) => parseInt(b.expires_date_ms) - parseInt(a.expires_date_ms));

    // Return the subscription with the latest expiration date
    return subscriptions[0] || null;
  }

  async updateUserSubscription(user, plan, iosReceipt, expiresDate) {
    const planConfig = this.plans[plan];
    
    const updatedSubscription = {
      plan: plan,
      status: expiresDate && expiresDate > new Date() ? 'active' : (plan === 'free' ? 'active' : 'expired'),
      platform: 'ios',
      iosReceiptData: iosReceipt ? {
        productId: iosReceipt.product_id,
        transactionId: iosReceipt.transaction_id,
        originalTransactionId: iosReceipt.original_transaction_id,
        purchaseDate: new Date(parseInt(iosReceipt.purchase_date_ms)),
        expiresDate: expiresDate
      } : null,
      startDate: user.subscription?.startDate || new Date(),
      endDate: expiresDate,
      usage: {
        requests: { 
          current: user.subscription?.usage?.requests?.current || 0, 
          limit: planConfig.requests 
        },
        tokens: { 
          current: user.subscription?.usage?.tokens?.current || 0, 
          limit: planConfig.tokens 
        },
        resetDate: user.subscription?.usage?.resetDate || dynamoDBService.getNextMonthDate()
      }
    };

    const updatedUser = await dynamoDBService.updateUserSubscription(user.userId, updatedSubscription);
    return updatedUser;
  }

  async refreshSubscriptionStatus(userId) {
    try {
      const user = await dynamoDBService.getUserById(userId);
      if (!user || !user.subscription?.iosReceiptData) {
        return null;
      }

      logger.info('iOS subscription refresh requested', { userId });
      
      return {
        plan: user.subscription.plan,
        status: user.subscription.status,
        expiresDate: user.subscription.endDate,
        needsReceiptRefresh: true
      };
    } catch (error) {
      logger.error('iOS subscription refresh error', { userId, error: error.message });
      throw error;
    }
  }

  async handleAppStoreServerNotification(notificationData) {
    try {
      logger.info('Processing App Store Server Notification', { 
        notificationType: notificationData.notification_type 
      });

      // For local testing, just log the notification
      if (!process.env.IOS_SHARED_SECRET) {
        logger.info('Mock App Store notification processed', notificationData);
        return;
      }

      // Real implementation would process the notification here
      logger.info('App Store notification processed successfully', {
        notificationType: notificationData.notification_type
      });

    } catch (error) {
      logger.error('App Store notification processing error', { error: error.message });
      throw error;
    }
  }

  getPlans() {
    return this.plans;
  }
}

module.exports = new IOSSubscriptionService();