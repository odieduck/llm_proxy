#!/bin/bash

echo "🔄 Deploying session timeout update to App Runner..."

# Check if apprunner.yaml exists
if [ ! -f "apprunner.yaml" ]; then
    echo "❌ apprunner.yaml not found. Make sure you're in the project root directory."
    exit 1
fi

echo "📋 Session timeout configuration:"
echo "  - Session timeout: 5 hours of inactivity"
echo "  - JWT token expires: 5 hours"  
echo "  - Rolling sessions: Reset on each request"
echo ""

echo "🚀 Triggering App Runner deployment..."
echo "The service will automatically redeploy when you push changes or"
echo "you can trigger a manual deployment in the App Runner console."

echo ""
echo "✅ Configuration updated in apprunner.yaml:"
echo "  SESSION_TIMEOUT_HOURS: 5"
echo ""
echo "📝 Changes made:"
echo "  1. Session cookies expire after 5 hours of inactivity"
echo "  2. JWT tokens expire after 5 hours"
echo "  3. Sessions reset expiration on each request (rolling timeout)"
echo "  4. Login UI shows timeout information"
echo ""
echo "🔗 Next steps:"
echo "  1. Commit and push changes to trigger deployment"
echo "  2. Or manually deploy via App Runner console"
echo "  3. Test session timeout behavior"