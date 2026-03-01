# Deployment Guide - Accessibility AI Serverless System

## Prerequisites

- AWS Account with appropriate permissions
- AWS CLI configured (`aws configure`)
- AWS SAM CLI installed
- Node.js 18.x or later
- Docker Desktop (for local testing)
- Python 3.9+ (for backend services)

## Quick Start

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install Lambda function dependencies
cd lambda/transcription-service && npm install
cd ../cost-monitor && npm install
cd ../cache-manager && npm install
cd ../sign-language-translator && npm install
cd ../preferences-handler && npm install
cd ../health-check && npm install
```

### 2. Build the Project

```bash
# Build all packages
npm run build

# Or build Lambda functions with SAM
cd infrastructure
sam build
```

### 3. Deploy to AWS

```bash
cd infrastructure

# First-time deployment (guided)
sam deploy --guided

# Subsequent deployments
sam deploy
```

## Environment Configuration

### Development Environment

```bash
cd infrastructure
./deploy.sh dev
```

### Staging Environment

```bash
cd infrastructure
sam deploy --config-env staging
```

### Production Environment

```bash
cd infrastructure
sam deploy --config-env prod
```

## Local Testing

### Start Local API

```bash
cd infrastructure
sam build
sam local start-api
```

### Test Individual Lambda Functions

```bash
# Test transcription service
sam local invoke TranscriptionServiceFunction --event events/transcribe.json

# Test cost monitor
sam local invoke CostMonitorFunction --event events/cost-check.json
```

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
AWS_REGION=us-east-1
BUDGET_LIMIT=100
TRANSCRIBE_REGION=us-east-1
API_GATEWAY_URL=https://your-api-gateway-url.com
WEBSOCKET_URL=wss://your-websocket-url.com
```

### AWS Systems Manager Parameters

Store sensitive configuration in Parameter Store:

```bash
aws ssm put-parameter --name /accessibility-ai/api-key --value "your-api-key" --type SecureString
aws ssm put-parameter --name /accessibility-ai/budget-limit --value "100" --type String
```

## Browser Extension Deployment

### Build Extension

```bash
cd apps/chrome-extension
npm install
npm run build
```

### Package for Chrome Web Store

1. Create a ZIP file of the `dist` folder
2. Upload to Chrome Web Store Developer Dashboard
3. Configure auto-update settings

## Mobile App Deployment

### Build Android App

```bash
cd apps/android-app
./gradlew assembleRelease
```

### Deploy to Google Play Store

1. Sign the APK with your keystore
2. Upload to Google Play Console
3. Configure update checking

## Monitoring Setup

### CloudWatch Alarms

```bash
# Create budget alert
aws cloudwatch put-metric-alarm \
  --alarm-name accessibility-ai-budget-80 \
  --alarm-description "Alert at 80% budget" \
  --metric-name TotalCost \
  --namespace AWS/Billing \
  --statistic Sum \
  --period 86400 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold
```

### SNS Topic for Alerts

```bash
# Create SNS topic
aws sns create-topic --name accessibility-ai-alerts

# Subscribe to topic
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:123456789012:accessibility-ai-alerts \
  --protocol email \
  --notification-endpoint your-email@example.com
```

## Rollback Procedures

### Rollback Lambda Function

```bash
# List versions
aws lambda list-versions-by-function --function-name TranscriptionServiceFunction

# Update alias to previous version
aws lambda update-alias \
  --function-name TranscriptionServiceFunction \
  --name prod \
  --function-version 2
```

### Rollback Full Stack

```bash
cd infrastructure
sam deploy --parameter-overrides Version=previous-version
```

## Troubleshooting

### Lambda Function Errors

```bash
# View logs
aws logs tail /aws/lambda/TranscriptionServiceFunction --follow

# Check metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=TranscriptionServiceFunction \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-02T00:00:00Z \
  --period 3600 \
  --statistics Sum
```

### API Gateway Issues

```bash
# Test endpoint
curl -X POST https://your-api-gateway-url.com/translate \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{"text": "Hello world"}'
```

### Cost Monitoring

```bash
# Check current costs
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost
```

## Security Best Practices

1. **API Keys**: Rotate API keys regularly
2. **IAM Roles**: Use least privilege principle
3. **Encryption**: Enable encryption at rest for DynamoDB and S3
4. **HTTPS/WSS**: Enforce secure connections only
5. **Secrets**: Store sensitive data in AWS Secrets Manager

## Performance Optimization

1. **Lambda Memory**: Adjust based on CloudWatch metrics
2. **DynamoDB Capacity**: Use on-demand or auto-scaling
3. **CloudFront**: Configure appropriate cache policies
4. **S3**: Use appropriate storage classes

## Cost Optimization

1. **Caching**: Maximize cache hit rates
2. **Batch Processing**: Use batch mode when possible
3. **Reserved Capacity**: Consider for predictable workloads
4. **Monitoring**: Set up budget alerts at 80%, 95%, 100%

## Support

For issues or questions:
- Check CloudWatch Logs
- Review API Gateway metrics
- Contact AWS Support for infrastructure issues
- Review project documentation in `.kiro/specs/`
