#!/bin/bash

echo "🔐 Creating IAM Role for App Runner..."

# Create trust policy for App Runner
cat > /tmp/apprunner-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "tasks.apprunner.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create DynamoDB access policy
cat > /tmp/dynamodb-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem", 
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:571973230937:table/llm-proxy-*"
      ]
    }
  ]
}
EOF

# Create the role
echo "Creating IAM role..."
aws iam create-role \
  --role-name AppRunnerLLMProxyRole \
  --assume-role-policy-document file:///tmp/apprunner-trust-policy.json \
  --description "Role for App Runner LLM Proxy service to access DynamoDB"

# Create and attach the DynamoDB policy
echo "Creating DynamoDB policy..."
aws iam create-policy \
  --policy-name AppRunnerLLMProxyDynamoDBPolicy \
  --policy-document file:///tmp/dynamodb-policy.json \
  --description "Policy for LLM Proxy service to access DynamoDB tables"

# Attach the policy to the role
echo "Attaching policy to role..."
aws iam attach-role-policy \
  --role-name AppRunnerLLMProxyRole \
  --policy-arn arn:aws:iam::571973230937:policy/AppRunnerLLMProxyDynamoDBPolicy

# Clean up temp files
rm /tmp/apprunner-trust-policy.json /tmp/dynamodb-policy.json

echo "✅ IAM Role created successfully!"
echo "Role ARN: arn:aws:iam::571973230937:role/AppRunnerLLMProxyRole"
echo ""
echo "Next steps:"
echo "1. Go to App Runner Console"
echo "2. Update your service configuration"
echo "3. Add this role as the Instance/Task Role"