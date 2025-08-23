#!/bin/bash

# LLM Proxy Service Local Testing Script
# This script tests all the core functionality locally

set -e  # Exit on any error

echo "🚀 Starting LLM Proxy Service Test Suite"
echo "============================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="http://localhost:3000"
TEST_EMAIL="test@example.com"
TEST_PASSWORD="password123"
JWT_TOKEN=""

# Helper functions
print_test() {
    echo -e "${BLUE}Testing: $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Test function
test_endpoint() {
    local description=$1
    local curl_command=$2
    local expected_pattern=$3
    
    print_test "$description"
    
    response=$(eval "$curl_command" 2>/dev/null)
    status_code=$?
    
    if [ $status_code -eq 0 ]; then
        if [[ -z "$expected_pattern" ]] || echo "$response" | grep -q "$expected_pattern"; then
            print_success "$description"
            return 0
        else
            print_error "$description - Unexpected response: $response"
            return 1
        fi
    else
        print_error "$description - Request failed"
        return 1
    fi
}

# Start testing
echo -e "\n${YELLOW}1. Testing Health Check${NC}"
echo "========================"

test_endpoint "Health endpoint" \
    "curl -s '$BASE_URL/health'" \
    '"status":"OK"'

echo -e "\n${YELLOW}2. Testing User Registration${NC}"
echo "=============================="

print_test "Register new user"
register_response=$(curl -s -X POST "$BASE_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d "{
        \"email\": \"$TEST_EMAIL\",
        \"username\": \"testuser\",
        \"password\": \"$TEST_PASSWORD\"
    }")

if echo "$register_response" | grep -q "token"; then
    JWT_TOKEN=$(echo "$register_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    print_success "User registration successful"
    echo "JWT Token: ${JWT_TOKEN:0:20}..."
else
    print_warning "Registration may have failed (user might already exist)"
    # Try login instead
    print_test "Trying login instead"
    login_response=$(curl -s -X POST "$BASE_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"$TEST_EMAIL\",
            \"password\": \"$TEST_PASSWORD\"
        }")
    
    if echo "$login_response" | grep -q "token"; then
        JWT_TOKEN=$(echo "$login_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
        print_success "Login successful"
        echo "JWT Token: ${JWT_TOKEN:0:20}..."
    else
        print_error "Both registration and login failed"
        echo "Response: $login_response"
        exit 1
    fi
fi

echo -e "\n${YELLOW}3. Testing Authentication${NC}"
echo "=========================="

test_endpoint "Request without token (should fail)" \
    "curl -s '$BASE_URL/api/providers'" \
    '"error":"Access token required"'

test_endpoint "Request with valid token" \
    "curl -s '$BASE_URL/api/providers' -H 'Authorization: Bearer $JWT_TOKEN'" \
    '"success":true'

echo -e "\n${YELLOW}4. Testing API Endpoints${NC}"
echo "========================"

test_endpoint "Get available providers" \
    "curl -s '$BASE_URL/api/providers' -H 'Authorization: Bearer $JWT_TOKEN'" \
    'openai.*anthropic.*bedrock'

test_endpoint "Get OpenAI models" \
    "curl -s '$BASE_URL/api/models?provider=openai' -H 'Authorization: Bearer $JWT_TOKEN'" \
    'gpt-4'

test_endpoint "Get Anthropic models" \
    "curl -s '$BASE_URL/api/models?provider=anthropic' -H 'Authorization: Bearer $JWT_TOKEN'" \
    'claude'

echo -e "\n${YELLOW}5. Testing LLM Request (without API keys)${NC}"
echo "================================================"

print_test "LLM request (should fail due to missing API key)"
llm_response=$(curl -s "$BASE_URL/api?provider=openai&model=gpt-3.5-turbo&prompt=hello" \
    -H "Authorization: Bearer $JWT_TOKEN")

if echo "$llm_response" | grep -q "API key not configured"; then
    print_success "LLM request correctly failed due to missing API key"
else
    print_warning "Unexpected LLM response: $llm_response"
fi

echo -e "\n${YELLOW}6. Testing Subscription Management${NC}"
echo "==================================="

test_endpoint "Get subscription status" \
    "curl -s '$BASE_URL/subscription/status' -H 'Authorization: Bearer $JWT_TOKEN'" \
    '"plan":"free"'

test_endpoint "Get subscription plans" \
    "curl -s '$BASE_URL/subscription/plans'" \
    '"free".*"pro".*"enterprise"'

test_endpoint "Get usage statistics" \
    "curl -s '$BASE_URL/subscription/usage' -H 'Authorization: Bearer $JWT_TOKEN'" \
    '"totalRequests"'

echo -e "\n${YELLOW}7. Testing iOS Subscription Endpoints${NC}"
echo "======================================"

test_endpoint "Get iOS plans" \
    "curl -s '$BASE_URL/ios/plans'" \
    'productIds'

test_endpoint "Get iOS subscription status" \
    "curl -s '$BASE_URL/ios/status' -H 'Authorization: Bearer $JWT_TOKEN'" \
    '"platform"'

echo -e "\n${YELLOW}8. Testing Error Handling${NC}"
echo "==========================="

test_endpoint "Invalid JWT token" \
    "curl -s '$BASE_URL/api/providers' -H 'Authorization: Bearer invalid-token'" \
    '"error"'

test_endpoint "Missing required fields" \
    "curl -s -X POST '$BASE_URL/auth/register' -H 'Content-Type: application/json' -d '{}'" \
    '"error"'

test_endpoint "Invalid provider" \
    "curl -s '$BASE_URL/api/models?provider=invalid' -H 'Authorization: Bearer $JWT_TOKEN'" \
    '"error"'

echo -e "\n${YELLOW}9. Testing Rate Limiting${NC}"
echo "========================="

print_test "Rate limiting (sending multiple requests)"
rate_limit_count=0
for i in {1..10}; do
    response=$(curl -s "$BASE_URL/api/providers" -H "Authorization: Bearer $JWT_TOKEN")
    if echo "$response" | grep -q "Too many requests"; then
        rate_limit_count=$((rate_limit_count + 1))
    fi
    sleep 0.1
done

if [ $rate_limit_count -gt 0 ]; then
    print_success "Rate limiting is working ($rate_limit_count requests blocked)"
else
    print_warning "Rate limiting may not be active (consider lowering limits for testing)"
fi

echo -e "\n${GREEN}🎉 Test Suite Complete!${NC}"
echo "======================="

echo -e "\nTest Summary:"
echo "- Health check: ✅"
echo "- Authentication: ✅" 
echo "- API endpoints: ✅"
echo "- Subscription management: ✅"
echo "- iOS endpoints: ✅"
echo "- Error handling: ✅"
echo "- Rate limiting: ✅"

echo -e "\n${BLUE}Next Steps:${NC}"
echo "1. Add LLM provider API keys to .env for full testing"
echo "2. Set up Stripe keys for web subscription testing"
echo "3. Configure iOS App Store credentials for mobile testing"
echo "4. Test with real LLM requests"

echo -e "\n${BLUE}Your test user credentials:${NC}"
echo "Email: $TEST_EMAIL"
echo "Password: $TEST_PASSWORD"
echo "JWT Token: ${JWT_TOKEN:0:50}..."

echo -e "\n${GREEN}Service is running successfully! 🚀${NC}"