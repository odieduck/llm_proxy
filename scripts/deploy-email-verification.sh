#!/bin/bash

echo "📧 Deploying Email Verification System..."

echo "✅ Features Added:"
echo "  1. Email verification tokens and expiration"
echo "  2. Email verification endpoints:"
echo "     - GET /auth/verify-email?token=..."
echo "     - POST /auth/resend-verification"
echo "     - GET /auth/verification-status?email=..."
echo "  3. Registration now sends verification email"
echo "  4. API endpoints can require email verification"
echo "  5. Web UI shows verification status and resend option"
echo ""

echo "🔧 Configuration Options:"
echo "  REQUIRE_EMAIL_VERIFICATION=true    - Require verification for API access"
echo "  EMAIL_SERVICE_ENABLED=false        - Enable actual email sending"
echo "  FROM_EMAIL=noreply@finbrightai.com - From email address"
echo "  BASE_URL=https://api.finbrightai.com - Base URL for verification links"
echo ""

echo "🧪 Testing (Development Mode):"
echo "  1. Register a new user - check console for verification link"
echo "  2. Copy verification URL from console logs"
echo "  3. Visit verification URL to verify email"
echo "  4. Test API access with verified vs unverified users"
echo ""

echo "📋 Database Schema Updated:"
echo "  - emailVerified: boolean"
echo "  - emailVerificationToken: string"
echo "  - emailVerificationExpires: ISO date"
echo ""

echo "🚀 Ready to Deploy:"
echo "  1. Commit and push changes"
echo "  2. App Runner will automatically redeploy"
echo "  3. New registrations will require email verification"
echo ""

echo "📧 To Enable Real Email Sending:"
echo "  1. Set EMAIL_SERVICE_ENABLED=true"
echo "  2. Add AWS SES, SendGrid, or other email service"
echo "  3. Update src/utils/email.js with actual email provider"
echo ""

echo "✨ Email verification system is ready!"