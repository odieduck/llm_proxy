const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
  DynamoDBDocumentClient, 
  GetCommand, 
  PutCommand, 
  UpdateCommand, 
  QueryCommand,
  ScanCommand 
} = require('@aws-sdk/lib-dynamodb');
const { logger } = require('../utils/logger');

class DynamoDBService {
  constructor() {
    // Configure DynamoDB client
    const config = {
      region: process.env.AWS_REGION || 'us-east-1'
    };

    // For local development, use DynamoDB Local if available
    if (process.env.DYNAMODB_LOCAL_ENDPOINT) {
      config.endpoint = process.env.DYNAMODB_LOCAL_ENDPOINT;
      config.credentials = {
        accessKeyId: 'fakeMyKeyId',
        secretAccessKey: 'fakeSecretAccessKey'
      };
    }

    const client = new DynamoDBClient(config);
    this.docClient = DynamoDBDocumentClient.from(client);
    
    // Table names
    this.tables = {
      users: process.env.DYNAMODB_USERS_TABLE || 'llm-proxy-users',
      sessions: process.env.DYNAMODB_SESSIONS_TABLE || 'llm-proxy-sessions',
      usage: process.env.DYNAMODB_USAGE_TABLE || 'llm-proxy-usage'
    };

    logger.info('DynamoDB service initialized', { 
      region: config.region,
      tables: this.tables,
      localEndpoint: config.endpoint 
    });
  }

  async createUser(userData) {
    try {
      const userId = userData.userId || require('uuid').v4();
      const now = new Date().toISOString();
      
      const user = {
        PK: `USER#${userData.email}`,
        SK: 'PROFILE',
        userId,
        email: userData.email,
        username: userData.username,
        password: userData.password,
        role: userData.role || 'user',
        socialProviders: userData.socialProviders || [],
        emailVerified: false,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        subscription: {
          plan: 'free',
          status: 'active',
          platform: 'stripe',
          usage: {
            requests: { current: 0, limit: 100 },
            tokens: { current: 0, limit: 10000 },
            resetDate: this.getNextMonthDate()
          }
        },
        createdAt: now,
        lastLogin: null,
        GSI1PK: `USER#${userId}`,
        GSI1SK: 'PROFILE'
      };

      await this.docClient.send(new PutCommand({
        TableName: this.tables.users,
        Item: user,
        ConditionExpression: 'attribute_not_exists(PK)'
      }));

      logger.info('User created in DynamoDB', { userId, email: userData.email });
      return this.formatUser(user);
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error('User already exists');
      }
      logger.error('Error creating user in DynamoDB', { error: error.message });
      throw error;
    }
  }

  async getUserByEmail(email) {
    try {
      const response = await this.docClient.send(new GetCommand({
        TableName: this.tables.users,
        Key: {
          PK: `USER#${email}`,
          SK: 'PROFILE'
        }
      }));

      return response.Item ? this.formatUser(response.Item) : null;
    } catch (error) {
      logger.error('Error getting user by email from DynamoDB', { 
        email, 
        error: error.message 
      });
      throw error;
    }
  }

  async getUserById(userId) {
    try {
      const response = await this.docClient.send(new QueryCommand({
        TableName: this.tables.users,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'PROFILE'
        }
      }));

      return response.Items && response.Items[0] ? this.formatUser(response.Items[0]) : null;
    } catch (error) {
      logger.error('Error getting user by ID from DynamoDB', { 
        userId, 
        error: error.message 
      });
      throw error;
    }
  }

  async updateUserLogin(email) {
    try {
      const now = new Date().toISOString();
      
      await this.docClient.send(new UpdateCommand({
        TableName: this.tables.users,
        Key: {
          PK: `USER#${email}`,
          SK: 'PROFILE'
        },
        UpdateExpression: 'SET lastLogin = :lastLogin',
        ExpressionAttributeValues: {
          ':lastLogin': now
        }
      }));

      logger.info('User login updated in DynamoDB', { email });
    } catch (error) {
      logger.error('Error updating user login in DynamoDB', { 
        email, 
        error: error.message 
      });
      throw error;
    }
  }

  async updateUserSubscription(userId, subscriptionData) {
    try {
      // First get user to find their email (PK)
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      await this.docClient.send(new UpdateCommand({
        TableName: this.tables.users,
        Key: {
          PK: `USER#${user.email}`,
          SK: 'PROFILE'
        },
        UpdateExpression: 'SET subscription = :subscription',
        ExpressionAttributeValues: {
          ':subscription': subscriptionData
        }
      }));

      logger.info('User subscription updated in DynamoDB', { userId });
      return { ...user, subscription: subscriptionData };
    } catch (error) {
      logger.error('Error updating user subscription in DynamoDB', { 
        userId, 
        error: error.message 
      });
      throw error;
    }
  }

  async incrementUsage(userId, tokensUsed = 0) {
    try {
      // First get user to find their email (PK)
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const now = new Date();
      const resetDate = new Date(user.subscription.usage.resetDate);
      
      // Check if we need to reset usage (new month)
      if (now > resetDate) {
        await this.docClient.send(new UpdateCommand({
          TableName: this.tables.users,
          Key: {
            PK: `USER#${user.email}`,
            SK: 'PROFILE'
          },
          UpdateExpression: 'SET subscription.#usage.requests.current = :zero, subscription.#usage.tokens.current = :zero, subscription.#usage.resetDate = :resetDate',
          ExpressionAttributeNames: {
            '#usage': 'usage'
          },
          ExpressionAttributeValues: {
            ':zero': 0,
            ':resetDate': this.getNextMonthDate()
          }
        }));
      }

      // Increment usage
      await this.docClient.send(new UpdateCommand({
        TableName: this.tables.users,
        Key: {
          PK: `USER#${user.email}`,
          SK: 'PROFILE'
        },
        UpdateExpression: 'ADD subscription.#usage.requests.current :reqInc, subscription.#usage.tokens.current :tokInc',
        ExpressionAttributeNames: {
          '#usage': 'usage'
        },
        ExpressionAttributeValues: {
          ':reqInc': 1,
          ':tokInc': tokensUsed
        }
      }));

      // Log usage to separate table for analytics
      await this.logApiUsage(userId, {
        provider: 'unknown',
        model: 'unknown',
        tokensUsed,
        cost: 0
      });

      logger.info('Usage incremented in DynamoDB', { userId, tokensUsed });
    } catch (error) {
      logger.error('Error incrementing usage in DynamoDB', { 
        userId, 
        error: error.message 
      });
      throw error;
    }
  }

  async logApiUsage(userId, usageData) {
    try {
      const usageId = require('uuid').v4();
      const now = new Date().toISOString();
      const dateOnly = now.split('T')[0];

      const usage = {
        PK: `USER#${userId}`,
        SK: `USAGE#${now}#${usageId}`,
        userId,
        date: now,
        dateOnly,
        provider: usageData.provider,
        model: usageData.model,
        tokensUsed: usageData.tokensUsed,
        cost: usageData.cost,
        GSI1PK: `USAGE#${dateOnly}`,
        GSI1SK: `USER#${userId}`
      };

      await this.docClient.send(new PutCommand({
        TableName: this.tables.usage,
        Item: usage
      }));

      logger.debug('API usage logged to DynamoDB', { userId, provider: usageData.provider });
    } catch (error) {
      logger.error('Error logging API usage to DynamoDB', { 
        userId, 
        error: error.message 
      });
      // Don't throw - usage logging shouldn't break the main flow
    }
  }

  async getUserUsage(userId, days = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
      
      const response = await this.docClient.send(new QueryCommand({
        TableName: this.tables.usage,
        KeyConditionExpression: 'PK = :pk AND SK BETWEEN :start AND :end',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':start': `USAGE#${startDate.toISOString()}`,
          ':end': `USAGE#${endDate.toISOString()}`
        }
      }));

      return response.Items || [];
    } catch (error) {
      logger.error('Error getting user usage from DynamoDB', { 
        userId, 
        error: error.message 
      });
      throw error;
    }
  }

  formatUser(dynamoItem) {
    return {
      _id: dynamoItem.userId,
      userId: dynamoItem.userId,
      email: dynamoItem.email,
      username: dynamoItem.username,
      password: dynamoItem.password,
      role: dynamoItem.role,
      emailVerified: dynamoItem.emailVerified || false,
      socialProviders: dynamoItem.socialProviders || [],
      subscription: dynamoItem.subscription,
      createdAt: dynamoItem.createdAt,
      lastLogin: dynamoItem.lastLogin
    };
  }

  getNextMonthDate() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  }

  canMakeRequest(user) {
    if (!user || !user.subscription) return false;
    
    const usage = user.subscription.usage;
    const now = new Date();
    const resetDate = new Date(usage.resetDate);
    
    // Reset usage if it's a new month
    if (now > resetDate) {
      return true; // Will be reset on next increment
    }
    
    return usage.requests.current < usage.requests.limit || usage.requests.limit === -1;
  }

  hasActiveSubscription(user) {
    if (!user || !user.subscription) return false;
    return user.subscription.status === 'active';
  }

  // Email verification methods
  async setEmailVerificationToken(email, token, expiresAt) {
    try {
      await this.docClient.send(new UpdateCommand({
        TableName: this.tables.users,
        Key: {
          PK: `USER#${email}`,
          SK: 'PROFILE'
        },
        UpdateExpression: 'SET emailVerificationToken = :token, emailVerificationExpires = :expires',
        ExpressionAttributeValues: {
          ':token': token,
          ':expires': expiresAt
        },
        ConditionExpression: 'attribute_exists(PK)'
      }));
      
      logger.info('Email verification token set', { email });
    } catch (error) {
      logger.error('Error setting email verification token', { email, error: error.message });
      throw error;
    }
  }

  async verifyEmailToken(token) {
    try {
      // Scan for user with this verification token (not optimal but works for small scale)
      const response = await this.docClient.send(new ScanCommand({
        TableName: this.tables.users,
        FilterExpression: 'emailVerificationToken = :token AND emailVerificationExpires > :now',
        ExpressionAttributeValues: {
          ':token': token,
          ':now': new Date().toISOString()
        }
      }));

      if (!response.Items || response.Items.length === 0) {
        return null; // Invalid or expired token
      }

      const user = response.Items[0];
      
      // Mark email as verified and clear token
      await this.docClient.send(new UpdateCommand({
        TableName: this.tables.users,
        Key: {
          PK: user.PK,
          SK: user.SK
        },
        UpdateExpression: 'SET emailVerified = :verified REMOVE emailVerificationToken, emailVerificationExpires',
        ExpressionAttributeValues: {
          ':verified': true
        }
      }));

      logger.info('Email verified successfully', { email: user.email });
      return this.formatUser(user);
    } catch (error) {
      logger.error('Error verifying email token', { token, error: error.message });
      throw error;
    }
  }

  async resendVerificationEmail(email) {
    try {
      const user = await this.getUserByEmail(email);
      if (!user) {
        throw new Error('User not found');
      }
      
      if (user.emailVerified) {
        throw new Error('Email already verified');
      }

      return user;
    } catch (error) {
      logger.error('Error checking user for resend verification', { email, error: error.message });
      throw error;
    }
  }
}

module.exports = new DynamoDBService();