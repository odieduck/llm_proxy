const Stripe = require('stripe');
const dynamoDBService = require('../config/dynamodb');
const { logger } = require('../utils/logger');

class SubscriptionService {
  constructor() {
    this.stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;
    
    this.plans = {
      free: {
        name: 'Free Plan',
        price: 0,
        requests: 100,
        tokens: 10000,
        features: ['Basic API access', 'Community support']
      },
      pro: {
        name: 'Pro Plan',
        price: 29.99,
        stripePriceId: process.env.STRIPE_PRO_PRICE_ID,
        requests: 1000,
        tokens: 100000,
        features: ['Priority support', 'Advanced models', 'Higher limits']
      },
      enterprise: {
        name: 'Enterprise Plan',
        price: 99.99,
        stripePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
        requests: -1, // unlimited
        tokens: -1,   // unlimited
        features: ['Unlimited requests', 'Dedicated support', 'Custom models', 'SLA']
      }
    };
  }

  async createSubscription(userId, planName) {
    if (!this.stripe) {
      throw new Error('Stripe not configured');
    }

    const plan = this.plans[planName];
    if (!plan || planName === 'free') {
      throw new Error('Invalid plan');
    }

    try {
      const user = await dynamoDBService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      let customerId = user.subscription.stripeCustomerId;
      
      if (!customerId) {
        const customer = await this.stripe.customers.create({
          email: user.email,
          metadata: { userId: userId.toString() }
        });
        customerId = customer.id;
      }

      const subscription = await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: plan.stripePriceId }],
        metadata: { userId: userId.toString(), plan: planName }
      });

      const updatedSubscription = {
        ...user.subscription,
        plan: planName,
        status: 'active',
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: customerId,
        startDate: new Date(),
        endDate: new Date(subscription.current_period_end * 1000),
        usage: {
          requests: { current: 0, limit: plan.requests },
          tokens: { current: 0, limit: plan.tokens },
          resetDate: dynamoDBService.getNextMonthDate()
        }
      };

      const updatedUser = await dynamoDBService.updateUserSubscription(userId, updatedSubscription);
      logger.info('Subscription created', { userId, plan: planName, subscriptionId: subscription.id });
      
      return { subscription, user: updatedUser };
    } catch (error) {
      logger.error('Subscription creation error:', error);
      throw error;
    }
  }

  async cancelSubscription(userId) {
    if (!this.stripe) {
      throw new Error('Stripe not configured');
    }

    try {
      const user = await dynamoDBService.getUserById(userId);
      if (!user || !user.subscription.stripeSubscriptionId) {
        throw new Error('No active subscription found');
      }

      await this.stripe.subscriptions.update(user.subscription.stripeSubscriptionId, {
        cancel_at_period_end: true
      });

      const updatedSubscription = {
        ...user.subscription,
        status: 'cancelled'
      };
      
      const updatedUser = await dynamoDBService.updateUserSubscription(userId, updatedSubscription);

      logger.info('Subscription cancelled', { userId, subscriptionId: user.subscription.stripeSubscriptionId });
      return updatedUser;
    } catch (error) {
      logger.error('Subscription cancellation error:', error);
      throw error;
    }
  }

  async handleWebhook(event) {
    if (!this.stripe) {
      return;
    }

    try {
      switch (event.type) {
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          await this.handleSubscriptionChange(event.data.object);
          break;
        case 'invoice.payment_succeeded':
          await this.handlePaymentSuccess(event.data.object);
          break;
        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event.data.object);
          break;
      }
    } catch (error) {
      logger.error('Webhook handling error:', error);
      throw error;
    }
  }

  async handleSubscriptionChange(subscription) {
    const userId = subscription.metadata.userId;
    const user = await dynamoDBService.getUserById(userId);
    
    if (!user) return;

    const plan = subscription.metadata.plan || 'free';
    const planConfig = this.plans[plan];
    
    const updatedSubscription = {
      ...user.subscription,
      plan: plan,
      status: subscription.status === 'active' ? 'active' : 'inactive',
      endDate: new Date(subscription.current_period_end * 1000),
      usage: {
        ...user.subscription.usage,
        requests: { ...user.subscription.usage.requests, limit: planConfig.requests },
        tokens: { ...user.subscription.usage.tokens, limit: planConfig.tokens }
      }
    };

    await dynamoDBService.updateUserSubscription(userId, updatedSubscription);
    logger.info('Subscription updated via webhook', { userId, status: subscription.status });
  }

  async handlePaymentSuccess(invoice) {
    const subscription = await this.stripe.subscriptions.retrieve(invoice.subscription);
    const userId = subscription.metadata.userId;
    const user = await dynamoDBService.getUserById(userId);
    
    if (user) {
      const updatedSubscription = {
        ...user.subscription,
        status: 'active'
      };
      await dynamoDBService.updateUserSubscription(userId, updatedSubscription);
      logger.info('Payment succeeded', { userId, invoiceId: invoice.id });
    }
  }

  async handlePaymentFailed(invoice) {
    const subscription = await this.stripe.subscriptions.retrieve(invoice.subscription);
    const userId = subscription.metadata.userId;
    const user = await dynamoDBService.getUserById(userId);
    
    if (user) {
      const updatedSubscription = {
        ...user.subscription,
        status: 'past_due'
      };
      await dynamoDBService.updateUserSubscription(userId, updatedSubscription);
      logger.warn('Payment failed', { userId, invoiceId: invoice.id });
    }
  }

  getPlans() {
    return this.plans;
  }

  async getUserUsage(userId) {
    const user = await dynamoDBService.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const plan = this.plans[user.subscription.plan];
    const usage = user.subscription.usage;
    
    return {
      plan: user.subscription.plan,
      status: user.subscription.status,
      usage: {
        requests: {
          current: usage.requests.current,
          limit: usage.requests.limit,
          percentage: usage.requests.limit > 0 ? (usage.requests.current / usage.requests.limit * 100) : 0
        },
        tokens: {
          current: usage.tokens.current,
          limit: usage.tokens.limit,
          percentage: usage.tokens.limit > 0 ? (usage.tokens.current / usage.tokens.limit * 100) : 0
        }
      },
      resetDate: usage.resetDate,
      endDate: user.subscription.endDate
    };
  }
}

module.exports = new SubscriptionService();