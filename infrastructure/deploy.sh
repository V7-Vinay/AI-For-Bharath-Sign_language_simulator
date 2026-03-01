#!/bin/bash

# Deployment script for Accessibility AI Serverless System
# Usage: ./deploy.sh [dev|staging|prod]

set -e

ENVIRONMENT=${1:-dev}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🚀 Deploying Accessibility AI Serverless to $ENVIRONMENT environment..."

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    echo "❌ Error: Invalid environment. Use dev, staging, or prod"
    exit 1
fi

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ Error: AWS CLI is not installed"
    exit 1
fi

# Check if SAM CLI is installed
if ! command -v sam &> /dev/null; then
    echo "❌ Error: AWS SAM CLI is not installed"
    echo "Install it from: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"
    exit 1
fi

# Validate AWS credentials
echo "🔐 Validating AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ Error: AWS credentials not configured"
    exit 1
fi

# Build Lambda functions
echo "🔨 Building Lambda functions..."
cd "$SCRIPT_DIR"
sam build --config-env "$ENVIRONMENT"

# Validate template
echo "✅ Validating SAM template..."
sam validate --lint

# Deploy
echo "📦 Deploying to AWS..."
if [ "$ENVIRONMENT" = "prod" ]; then
    # Production requires manual confirmation
    sam deploy --config-env "$ENVIRONMENT" --no-confirm-changeset
else
    sam deploy --config-env "$ENVIRONMENT"
fi

# Get outputs
echo "📋 Deployment outputs:"
aws cloudformation describe-stacks \
    --stack-name "accessibility-ai-serverless-$ENVIRONMENT" \
    --query 'Stacks[0].Outputs' \
    --output table

echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Upload sign language models to S3 bucket"
echo "2. Configure SNS topic subscription for cost alerts"
echo "3. Test API endpoints"
echo "4. Deploy browser extension and mobile app"
