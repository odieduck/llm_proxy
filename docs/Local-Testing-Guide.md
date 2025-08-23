# Local Testing Guide for LLM Proxy Service

This guide walks you through testing the proxy service locally without requiring external API keys or subscriptions.

## Prerequisites

1. **Node.js** (v16+)
2. **MongoDB** (local or MongoDB Atlas)
3. **curl** or **Postman** for API testing

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Local Environment
```bash
# Copy environment file
cp .env.example .env

# Edit .env with minimal required settings
```

**Minimal `.env` for local testing:**
```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/llm-proxy-test
JWT_SECRET=super-secret-jwt-key-for-testing-only
SESSION_SECRET=super-secret-session-key-for-testing
```

### 3. Start MongoDB
```bash
# If using local MongoDB
mongod

# Or use MongoDB Atlas connection string in .env
```

### 4. Start the Service
```bash
# Development mode with auto-reload
npm run dev

# Or standard mode
npm start
```

You should see:
```
info: MongoDB Connected: localhost:27017
info: LLM Proxy Service running on port 3000
```

## Testing Scenarios

### 1. Health Check
```bash
curl http://localhost:3000/health
```
**Expected Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### 2. User Registration & Authentication

#### Register a Test User
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "username": "testuser",
    "password": "password123"
  }'
```

**Expected Response:**
```json
{
  "message": "User registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user_id",
    "email": "test@example.com",
    "username": "testuser",
    "subscription": {
      "plan": "free",
      "status": "active",
      "usage": {
        "requests": { "current": 0, "limit": 100 },
        "tokens": { "current": 0, "limit": 10000 }
      }
    }
  }
}
```

#### Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

**Save the JWT token from the response for subsequent requests.**

### 3. Test API Endpoints (Without LLM Provider Keys)

#### Get Available Providers
```bash
curl "http://localhost:3000/api/providers" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": ["openai", "anthropic", "bedrock"]
}
```

#### Get Available Models
```bash
curl "http://localhost:3000/api/models?provider=openai" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo", "o1-preview", "o1-mini", "o3-mini"]
}
```

#### Test LLM Request (Will Fail Without API Keys)
```bash
curl "http://localhost:3000/api?provider=openai&model=gpt-3.5-turbo&prompt=hello" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (without API key):**
```json
{
  "error": "OpenAI API key not configured"
}
```

### 4. Test Subscription Management

#### Get Subscription Status
```bash
curl "http://localhost:3000/subscription/status" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "plan": "free",
    "status": "active",
    "usage": {
      "requests": { "current": 0, "limit": 100, "percentage": 0 },
      "tokens": { "current": 0, "limit": 10000, "percentage": 0 }
    },
    "resetDate": "2024-02-01T00:00:00.000Z",
    "endDate": null
  }
}
```

#### Get Available Plans
```bash
curl "http://localhost:3000/subscription/plans"
```

### 5. Test iOS Subscription Endpoints

#### Get iOS Plans
```bash
curl "http://localhost:3000/ios/plans"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "plans": {
      "free": { "requests": 100, "tokens": 10000 },
      "pro": { "requests": 1000, "tokens": 100000 },
      "enterprise": { "requests": -1, "tokens": -1 }
    },
    "productIds": {
      "pro": {
        "monthly": "com.yourapp.pro.monthly",
        "yearly": "com.yourapp.pro.yearly"
      },
      "enterprise": {
        "monthly": "com.yourapp.enterprise.monthly",
        "yearly": "com.yourapp.enterprise.yearly"
      }
    }
  }
}
```

#### Get iOS Subscription Status
```bash
curl "http://localhost:3000/ios/status" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 6. Test Error Handling

#### Request Without Authentication
```bash
curl "http://localhost:3000/api/providers"
```

**Expected Response:**
```json
{
  "error": "Access token required"
}
```

#### Invalid JWT Token
```bash
curl "http://localhost:3000/api/providers" \
  -H "Authorization: Bearer invalid-token"
```

**Expected Response:**
```json
{
  "error": "Invalid token"
}
```

## Testing With Mock LLM Providers

### Option 1: Use Environment Variables with Test Keys
Add test API keys to `.env`:
```env
OPENAI_API_KEY=sk-test-key-will-fail-but-show-flow
ANTHROPIC_API_KEY=test-key
```

### Option 2: Mock Provider Responses
Create a test file to modify provider behavior:

```bash
# Create test override file
cat > src/providers/mock.js << 'EOF'
class MockProvider {
  async generateCompletion(model, prompt, options = {}) {
    return {
      provider: 'mock',
      model: model,
      response: `Mock response for: ${prompt}`,
      usage: { total_tokens: 25, prompt_tokens: 5, completion_tokens: 20 }
    };
  }

  getSupportedModels() {
    return ['mock-gpt-4', 'mock-claude-3'];
  }
}

module.exports = MockProvider;
EOF
```

Then modify `src/providers/index.js` to include the mock provider for testing.

## Load Testing

### Test Rate Limiting
```bash
# Send multiple requests quickly to test rate limiting
for i in {1..10}; do
  curl "http://localhost:3000/api/providers" \
    -H "Authorization: Bearer YOUR_JWT_TOKEN" &
done
wait
```

### Test Usage Tracking
Create multiple users and test usage limits:
```bash
# Script to test usage limits
#!/bin/bash
TOKEN="YOUR_JWT_TOKEN"

for i in {1..105}; do
  echo "Request $i"
  curl -s "http://localhost:3000/api?provider=openai&model=gpt-3.5-turbo&prompt=test$i" \
    -H "Authorization: Bearer $TOKEN" | jq '.error // .success'
done
```

## Database Testing

### Check MongoDB Data
```bash
# Connect to MongoDB
mongo llm-proxy-test

# View users
db.users.find().pretty()

# View subscription data
db.users.find({}, { subscription: 1, email: 1 }).pretty()

# Check API usage logs
db.users.find({}, { apiUsage: 1 }).pretty()
```

### Reset Test Data
```bash
# Drop test database
mongo llm-proxy-test --eval "db.dropDatabase()"
```

## Testing Checklist

- [ ] ✅ Service starts without errors
- [ ] ✅ Health endpoint responds
- [ ] ✅ User registration works
- [ ] ✅ JWT authentication works
- [ ] ✅ Provider/model endpoints respond
- [ ] ✅ Subscription status returns correctly
- [ ] ✅ Rate limiting works
- [ ] ✅ Error handling works
- [ ] ✅ Database stores user data
- [ ] ✅ Usage tracking increments
- [ ] ✅ iOS endpoints respond

## Troubleshooting

### Common Issues

1. **MongoDB Connection Error**
   ```
   Solution: Ensure MongoDB is running or check connection string
   ```

2. **JWT Token Invalid**
   ```
   Solution: Register a new user and use the fresh token
   ```

3. **Port Already in Use**
   ```bash
   # Kill process on port 3000
   lsof -ti:3000 | xargs kill -9
   ```

4. **Missing Dependencies**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

### Debug Logging
Set environment variable for detailed logging:
```bash
NODE_ENV=development npm run dev
```

## Next Steps

Once local testing is complete:
1. Add real LLM provider API keys
2. Test with actual LLM requests
3. Set up Stripe for web subscriptions
4. Configure iOS App Store for mobile testing
5. Deploy to staging/production environment

This testing approach ensures all core functionality works before adding external dependencies.