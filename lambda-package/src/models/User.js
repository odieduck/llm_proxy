const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  plan: {
    type: String,
    enum: ['free', 'pro', 'enterprise'],
    default: 'free'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'cancelled', 'past_due', 'expired'],
    default: 'active'
  },
  platform: {
    type: String,
    enum: ['stripe', 'ios', 'android'],
    default: 'stripe'
  },
  // Stripe data (existing)
  stripeSubscriptionId: String,
  stripeCustomerId: String,
  // iOS App Store data
  iosReceiptData: {
    productId: String,
    transactionId: String,
    originalTransactionId: String,
    purchaseDate: Date,
    expiresDate: Date,
    lastReceiptData: String, // Base64 encoded receipt
    lastValidationDate: { type: Date, default: Date.now }
  },
  // Android Play Store data (for future use)
  androidReceiptData: {
    productId: String,
    purchaseToken: String,
    orderId: String,
    purchaseTime: Date,
    expiresDate: Date,
    lastValidationDate: { type: Date, default: Date.now }
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: Date,
  usage: {
    requests: {
      current: { type: Number, default: 0 },
      limit: { type: Number, default: 100 }
    },
    tokens: {
      current: { type: Number, default: 0 },
      limit: { type: Number, default: 10000 }
    },
    resetDate: {
      type: Date,
      default: () => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth() + 1, 1);
      }
    }
  }
});

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    unique: true,
    sparse: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: function() {
      return !this.socialProviders || this.socialProviders.length === 0;
    }
  },
  socialProviders: [{
    provider: {
      type: String,
      enum: ['google', 'apple'],
      required: true
    },
    providerId: {
      type: String,
      required: true
    },
    email: String,
    name: String,
    picture: String
  }],
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  subscription: {
    type: subscriptionSchema,
    default: () => ({})
  },
  apiUsage: [{
    date: { type: Date, default: Date.now },
    provider: String,
    model: String,
    tokensUsed: Number,
    cost: Number
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: Date
}, {
  timestamps: true
});

userSchema.index({ 'socialProviders.provider': 1, 'socialProviders.providerId': 1 });
userSchema.index({ email: 1 });

userSchema.methods.hasActiveSubscription = function() {
  return this.subscription.status === 'active' && 
         (!this.subscription.endDate || this.subscription.endDate > new Date());
};

userSchema.methods.canMakeRequest = function() {
  if (!this.hasActiveSubscription()) {
    return this.subscription.plan === 'free';
  }
  
  const usage = this.subscription.usage;
  const now = new Date();
  
  if (now > usage.resetDate) {
    usage.requests.current = 0;
    usage.tokens.current = 0;
    usage.resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    this.save();
  }
  
  return usage.requests.current < usage.requests.limit;
};

userSchema.methods.incrementUsage = function(tokens = 0) {
  this.subscription.usage.requests.current += 1;
  this.subscription.usage.tokens.current += tokens;
  return this.save();
};

userSchema.methods.getUsageLimits = function() {
  const plans = {
    free: { requests: 100, tokens: 10000 },
    pro: { requests: 1000, tokens: 100000 },
    enterprise: { requests: -1, tokens: -1 }
  };
  return plans[this.subscription.plan];
};

module.exports = mongoose.model('User', userSchema);