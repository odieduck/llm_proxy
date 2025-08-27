#!/bin/bash

echo "🌐 Setting up CloudFront distribution for LLM Proxy..."

# Variables - UPDATE THESE
DOMAIN_NAME="api.yourdomain.com"
APP_RUNNER_URL="your-apprunner-url.us-east-1.awsapprunner.com"
HOSTED_ZONE_ID="YOUR_ROUTE53_ZONE_ID"

echo "Creating CloudFront distribution..."

# Create distribution configuration
cat > /tmp/cloudfront-config.json << EOF
{
  "CallerReference": "llm-proxy-$(date +%s)",
  "Comment": "LLM Proxy CloudFront Distribution",
  "DefaultRootObject": "",
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "apprunner-origin",
        "DomainName": "${APP_RUNNER_URL}",
        "CustomOriginConfig": {
          "HTTPPort": 443,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "https-only",
          "OriginSslProtocols": {
            "Quantity": 1,
            "Items": ["TLSv1.2"]
          }
        }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "apprunner-origin",
    "ViewerProtocolPolicy": "redirect-to-https",
    "MinTTL": 0,
    "ForwardedValues": {
      "QueryString": true,
      "Cookies": {
        "Forward": "all"
      },
      "Headers": {
        "Quantity": 3,
        "Items": ["Authorization", "Content-Type", "User-Agent"]
      }
    },
    "TrustedSigners": {
      "Enabled": false,
      "Quantity": 0
    }
  },
  "Enabled": true,
  "PriceClass": "PriceClass_100"
}
EOF

echo "📋 CloudFront distribution config created"
echo "⚠️  You'll need to:"
echo "1. Update the variables at the top of this script"
echo "2. Run: aws cloudfront create-distribution --distribution-config file:///tmp/cloudfront-config.json"
echo "3. Get the distribution domain name from the output"
echo "4. Create Route 53 alias record pointing to the CloudFront distribution"

# Clean up
rm /tmp/cloudfront-config.json