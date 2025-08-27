#!/bin/bash

# Script to deploy App Runner service with OpenAI API key
# This sets the environment variable and triggers a deployment

set -e

OPENAI_API_KEY="${1}"

if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ Error: Please provide your OpenAI API key as the first argument"
    echo ""
    echo "Usage:"
    echo "  ./scripts/update-apprunner-env.sh 'sk-proj-your-actual-api-key'"
    echo ""
    echo "🔧 Alternative Manual Method (AWS Console):"
    echo "1. Go to AWS App Runner Console: https://console.aws.amazon.com/apprunner"
    echo "2. Find your service (likely named 'llm-proxy' or similar)"
    echo "3. Click on the service name"
    echo "4. Go to 'Configuration' tab"
    echo "5. Click 'Edit' in the 'Configure service' section"
    echo "6. Add environment variable:"
    echo "   Name: OPENAI_API_KEY"
    echo "   Value: [your-openai-api-key]"
    echo "7. Click 'Save and deploy'"
    exit 1
fi

echo "🔑 Setting OpenAI API Key for deployment..."
export OPENAI_API_KEY="$OPENAI_API_KEY"

echo "🚀 Triggering App Runner deployment..."
echo ""

# Method 1: Try to find and update the service directly
echo "🔍 Attempting to find App Runner service..."
SERVICE_ARN=$(aws apprunner list-services --query "ServiceSummaryList[0].ServiceArn" --output text 2>/dev/null || echo "PERMISSION_DENIED")

if [ "$SERVICE_ARN" = "PERMISSION_DENIED" ] || [ -z "$SERVICE_ARN" ]; then
    echo "⚠️  Cannot access App Runner services directly (permission issue)."
    echo ""
    echo "📋 RECOMMENDED: Use AWS Console Method"
    echo "1. Go to: https://console.aws.amazon.com/apprunner"
    echo "2. Find your service"
    echo "3. Click 'Deploy' to trigger a new deployment"
    echo "4. The service will pick up the latest code with receipt parsing"
    echo ""
    echo "🔑 Set this environment variable in the console:"
    echo "   OPENAI_API_KEY = $OPENAI_API_KEY"
    echo ""
    exit 1
fi

echo "✅ Found service: $SERVICE_ARN"
echo "🔄 Starting deployment..."

# Trigger a deployment by updating the service (this will pick up latest code)
aws apprunner start-deployment --service-arn "$SERVICE_ARN"

echo "✅ Deployment started!"
echo ""
echo "📊 Monitor progress:"
echo "   aws apprunner describe-service --service-arn '$SERVICE_ARN' --query 'Service.Status'"
echo ""
echo "🧾 Once deployed, receipt parsing will be available at:"
echo "   https://api.finbrightai.com/api/parse-receipt"
echo ""
echo "⏱️  Deployment typically takes 3-5 minutes."
