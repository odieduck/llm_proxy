# 🚀 AWS Deployment Guide

This guide shows how to deploy your LLM Proxy Service to AWS using DynamoDB, Lambda, and other AWS services.

## 🏗️ **Why DynamoDB Over MongoDB for AWS?**

### **Cost Comparison:**
| Service | MongoDB Atlas | DynamoDB |
|---------|---------------|----------|
| **Free Tier** | 512MB storage | 25GB storage + 25 RCU/WCU |
| **Small App** | ~$57/month | ~$5-15/month |
| **Medium App** | ~$200/month | ~$30-80/month |
| **Large App** | ~$500+/month | ~$100-300/month |

### **AWS Benefits:**
- ✅ **Serverless**: No server management
- ✅ **Auto-scaling**: Handles traffic spikes automatically  
- ✅ **High availability**: 99.99% uptime SLA
- ✅ **Security**: IAM integration, encryption at rest
- ✅ **Backup**: Point-in-time recovery built-in
- ✅ **Global**: Multi-region replication

## 📊 **DynamoDB Table Design**

### **Users Table** (`llm-proxy-users`)
```
PK (String): USER#{email}
SK (String): PROFILE
GSI1PK: USER#{userId}
GSI1SK: PROFILE

Attributes:
- userId (String)
- email (String) 
- username (String)
- password (String, hashed)
- role (String): user|admin
- subscription (Map): plan, status, usage, platform data
- socialProviders (List): OAuth provider data
- createdAt (String, ISO date)
- lastLogin (String, ISO date)
```

### **Usage Table** (`llm-proxy-usage`)
```
PK (String): USER#{userId}
SK (String): USAGE#{timestamp}#{usageId}
GSI1PK: USAGE#{date}
GSI1SK: USER#{userId}

Attributes:
- provider (String): openai|anthropic|bedrock
- model (String): gpt-4, claude-3, etc.
- tokensUsed (Number)
- cost (Number)
- date (String, ISO timestamp)
```

### **Sessions Table** (`llm-proxy-sessions`)
```
PK (String): SESSION#{sessionId}
SK (String): DATA

Attributes:
- userId (String)
- data (Map): session data
- expiresAt (Number, TTL)
```

## 🛠️ **Deployment Options**

### **Option 1: AWS Lambda + API Gateway (Recommended)**

**Pros:**
- ✅ True serverless (pay per request)
- ✅ Auto-scaling to zero
- ✅ No server management
- ✅ Built-in HTTPS

**Cons:**  
- ⚠️ Cold start latency (~1-2s first request)
- ⚠️ 15-minute timeout limit

### **Option 2: AWS ECS Fargate**

**Pros:**
- ✅ Container-based deployment
- ✅ No cold starts
- ✅ Easier migration from Docker

**Cons:**
- ❌ Always-on costs (~$20-50/month minimum)

### **Option 3: AWS App Runner**

**Pros:**
- ✅ Simplest deployment (git push to deploy)
- ✅ Auto-scaling with no cold starts
- ✅ Built-in load balancing

**Cons:**
- ❌ Higher cost than Lambda for low traffic

## 🚀 **Step-by-Step Deployment**

### **Step 1: Setup AWS CLI & Credentials**
```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure credentials
aws configure
# Enter: Access Key ID, Secret Access Key, Region (us-east-1), Format (json)
```

### **Step 2: Create DynamoDB Tables**
```bash
# Install dependencies
npm install

# Create tables
node scripts/create-dynamodb-tables.js
```

### **Step 3: Deploy with AWS Lambda (Serverless)**

#### **Install Serverless Framework:**
```bash
npm install -g serverless
npm install serverless-offline --save-dev
```

#### **Create `serverless.yml`:**
```yaml
service: llm-proxy-service

frameworkVersion: '3'

provider:
  name: aws
  runtime: nodejs18.x
  region: us-east-1
  environment:
    DYNAMODB_USERS_TABLE: ${self:service}-${sls:stage}-users
    DYNAMODB_SESSIONS_TABLE: ${self:service}-${sls:stage}-sessions
    DYNAMODB_USAGE_TABLE: ${self:service}-${sls:stage}-usage
    JWT_SECRET: ${env:JWT_SECRET}
    OPENAI_API_KEY: ${env:OPENAI_API_KEY}
    ANTHROPIC_API_KEY: ${env:ANTHROPIC_API_KEY}
  iamRoleStatements:
    - Effect: Allow
      Action:
        - dynamodb:Query
        - dynamodb:Scan
        - dynamodb:GetItem
        - dynamodb:PutItem
        - dynamodb:UpdateItem
        - dynamodb:DeleteItem
      Resource: 
        - "arn:aws:dynamodb:${aws:region}:${aws:accountId}:table/${self:service}-${sls:stage}-*"

functions:
  api:
    handler: src/lambda.handler
    events:
      - http:
          path: /{proxy+}
          method: ANY
          cors: true

resources:
  Resources:
    UsersTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: ${self:service}-${sls:stage}-users
        AttributeDefinitions:
          - AttributeName: PK
            AttributeType: S
          - AttributeName: SK
            AttributeType: S
        KeySchema:
          - AttributeName: PK
            KeyType: HASH
          - AttributeName: SK
            KeyType: RANGE
        BillingMode: PAY_PER_REQUEST
```

#### **Create Lambda Handler (`src/lambda.js`):**
```javascript
const serverless = require('serverless-http');
const app = require('./index-dynamodb');

module.exports.handler = serverless(app);
```

#### **Deploy:**
```bash
# Set environment variables
export JWT_SECRET="your-super-secret-jwt-key"
export OPENAI_API_KEY="your-openai-key"

# Deploy
serverless deploy
```

### **Step 4: Deploy with AWS App Runner (Easier)**

#### **Create `apprunner.yaml`:**
```yaml
version: 1.0
runtime: nodejs18
build:
  commands:
    build:
      - npm install
run:
  runtime-version: 18.x
  command: node src/index-dynamodb.js
  network:
    port: 3000
  env:
    - name: NODE_ENV
      value: "production"
    - name: AWS_REGION
      value: "us-east-1"
```

#### **Deploy via AWS Console:**
1. Go to AWS App Runner
2. Create service from source repository
3. Connect GitHub/GitLab repo
4. Set build file: `apprunner.yaml`
5. Configure environment variables
6. Deploy!

### **Step 5: Configure Environment Variables**

#### **Required Environment Variables:**
```bash
# Core
NODE_ENV=production
AWS_REGION=us-east-1
JWT_SECRET=your-super-secret-jwt-key

# LLM Providers  
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret

# Database
DYNAMODB_USERS_TABLE=llm-proxy-prod-users
DYNAMODB_SESSIONS_TABLE=llm-proxy-prod-sessions  
DYNAMODB_USAGE_TABLE=llm-proxy-prod-usage

# OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-secret

# iOS (optional)
IOS_SHARED_SECRET=your-app-store-secret

# Stripe (optional)
STRIPE_SECRET_KEY=sk-your-stripe-key
```

## 💰 **Cost Estimation**

### **DynamoDB Costs (Pay-per-request):**
```
Small App (1K users, 10K req/month):
- Read Units: ~$1.25/month
- Write Units: ~$1.25/month
- Storage: ~$0.25/month
Total: ~$2.75/month

Medium App (10K users, 100K req/month):
- Read Units: ~$12.50/month  
- Write Units: ~$12.50/month
- Storage: ~$2.50/month
Total: ~$27.50/month
```

### **Lambda Costs:**
```
Small App: ~$0.20/month (free tier covers most)
Medium App: ~$5-15/month
Large App: ~$50-200/month
```

### **App Runner Costs:**
```
Small App: ~$25/month (always-on)
Medium App: ~$50-100/month
Large App: ~$200-500/month
```

## 🔧 **Local Development with DynamoDB**

### **Option 1: Use AWS DynamoDB Directly**
```bash
# Configure AWS credentials
aws configure

# Run application
npm run dev
```

### **Option 2: Use DynamoDB Local**
```bash
# Install DynamoDB Local
java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -sharedDb

# Set environment variable
export DYNAMODB_LOCAL_ENDPOINT=http://localhost:8000

# Run application
npm run dev
```

## 📊 **Monitoring & Analytics**

### **CloudWatch Metrics:**
- Request count and latency
- Error rates and types
- DynamoDB read/write capacity
- Lambda execution duration

### **Custom Analytics:**
```javascript
// Usage analytics query
const usage = await dynamoDBService.getUserUsage(userId, 30); // Last 30 days

// Daily usage aggregation  
const dailyStats = await dynamoDBService.getDailyUsageStats('2024-01-15');
```

## 🔒 **Security Best Practices**

### **IAM Roles:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem", 
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:ACCOUNT:table/llm-proxy-*"
      ]
    }
  ]
}
```

### **Environment Variables Security:**
- Use AWS Systems Manager Parameter Store
- Enable encryption at rest
- Rotate secrets regularly
- Use least-privilege IAM policies

## 🚀 **Performance Optimization**

### **DynamoDB Optimization:**
- Use single-table design pattern
- Implement proper GSI design  
- Enable auto-scaling for provisioned tables
- Use DynamoDB Accelerator (DAX) for caching

### **Lambda Optimization:**
- Enable provisioned concurrency for critical functions
- Optimize package size (<50MB)
- Use connection pooling
- Implement proper error handling

This AWS deployment strategy provides enterprise-grade scalability, security, and cost-effectiveness compared to traditional MongoDB hosting!