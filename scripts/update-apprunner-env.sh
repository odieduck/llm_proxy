#!/bin/bash

# Script to update App Runner environment variables
# You'll need to find your App Runner Service ARN first

echo "🔧 Updating App Runner Environment Variables..."

# You need to replace this with your actual service ARN
# Find it with: aws apprunner list-services --query 'ServiceSummaryList[0].ServiceArn'
SERVICE_ARN="arn:aws:apprunner:us-east-1:571973230937:service/llm-proxy-service/YOUR_SERVICE_ID"

# Note: App Runner doesn't support direct env var updates via CLI
# You need to do this through the console or update the entire service

echo "❌ App Runner doesn't support direct environment variable updates via CLI"
echo "✅ Please use the AWS Console method above"
echo ""
echo "Alternative: If you want to use CLI, you'd need to:"
echo "1. Export current service configuration"
echo "2. Update the configuration file"  
echo "3. Deploy a new service version"
echo ""
echo "But the Console method is much faster! Just 2 minutes."
