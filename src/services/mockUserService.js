const bcrypt = require('bcryptjs');
const { logger } = require('../utils/logger');

class MockUserService {
  constructor() {
    this.users = new Map();
    this.userIdCounter = 1;
    
    // Create a default test user
    this.createDefaultUsers();
  }

  async createDefaultUsers() {
    const adminPassword = await bcrypt.hash('admin123', 10);
    const testPassword = await bcrypt.hash('password123', 10);
    
    this.users.set('admin@example.com', {
      _id: 'admin_id',
      email: 'admin@example.com',
      username: 'admin',
      password: adminPassword,
      role: 'admin',
      subscription: {
        plan: 'enterprise',
        status: 'active',
        platform: 'stripe',
        usage: {
          requests: { current: 0, limit: -1 },
          tokens: { current: 0, limit: -1 },
          resetDate: new Date()
        }
      },
      apiUsage: [],
      createdAt: new Date(),
      lastLogin: new Date()
    });
    
    this.users.set('test@example.com', {
      _id: 'test_user_id',
      email: 'test@example.com',
      username: 'testuser',
      password: testPassword,
      role: 'user',
      subscription: {
        plan: 'free',
        status: 'active',
        platform: 'stripe',
        usage: {
          requests: { current: 0, limit: 100 },
          tokens: { current: 0, limit: 10000 },
          resetDate: new Date()
        }
      },
      apiUsage: [],
      createdAt: new Date(),
      lastLogin: null
    });

    logger.info('Mock users created for testing', { 
      userCount: this.users.size,
      users: Array.from(this.users.keys())
    });
  }

  async findByEmail(email) {
    return this.users.get(email) || null;
  }

  async findById(id) {
    for (const user of this.users.values()) {
      if (user._id === id) {
        return user;
      }
    }
    return null;
  }

  async create(userData) {
    const userId = `user_${this.userIdCounter++}`;
    const user = {
      _id: userId,
      email: userData.email,
      username: userData.username,
      password: userData.password,
      role: 'user',
      subscription: {
        plan: 'free',
        status: 'active',
        platform: 'stripe',
        usage: {
          requests: { current: 0, limit: 100 },
          tokens: { current: 0, limit: 10000 },
          resetDate: new Date()
        }
      },
      apiUsage: [],
      createdAt: new Date(),
      lastLogin: null
    };

    this.users.set(userData.email, user);
    return user;
  }

  async updateLastLogin(email) {
    const user = this.users.get(email);
    if (user) {
      user.lastLogin = new Date();
    }
    return user;
  }

  async incrementUsage(userId, tokens = 0) {
    const user = await this.findById(userId);
    if (user) {
      user.subscription.usage.requests.current += 1;
      user.subscription.usage.tokens.current += tokens;
      
      user.apiUsage.push({
        date: new Date(),
        provider: 'mock',
        model: 'test',
        tokensUsed: tokens,
        cost: 0.01
      });
    }
    return user;
  }

  canMakeRequest(user) {
    if (!user) return false;
    
    const usage = user.subscription.usage;
    return usage.requests.current < usage.requests.limit || usage.requests.limit === -1;
  }

  hasActiveSubscription(user) {
    if (!user) return false;
    return user.subscription.status === 'active';
  }
}

module.exports = new MockUserService();