# Accessibility AI Serverless System

A cost-optimized, serverless architecture providing real-time speech-to-text transcription and sign language translation for deaf and hard-of-hearing users. Built with AWS serverless services.

## 🎯 Project Overview

This system provides:

- **Real-time speech transcription** using AWS Transcribe
- **Sign language translation** (ASL/BSL) with animated avatars
- **Chrome browser extension** for web accessibility
- **Android mobile app** for on-the-go accessibility
- **Cost-optimized architecture** with aggressive caching and budget enforcement

## 🏗️ Architecture

### Key Design Principles

1. **Cost-First Architecture**: Every design decision prioritizes cost optimization
2. **Client-Side Processing**: Audio preprocessing and avatar rendering on client devices
3. **Aggressive Caching**: Multi-layer caching (CloudFront, DynamoDB, client-side)
4. **Serverless-Native**: AWS Lambda, API Gateway, DynamoDB, S3, CloudFront
5. **Budget Enforcement**: Proactive monitoring with hard limits at $80/$95/$100

### Infrastructure Components

- **AWS Lambda Functions**:
  - Transcription Service (1GB memory) - AWS Transcribe orchestration
  - Sign Language Translator (512MB memory) - Text-to-animation conversion
  - Cost Monitor (256MB memory) - Budget tracking and enforcement
  - Cache Manager (256MB memory) - Cache optimization and eviction
  - Preferences Handler (256MB memory) - User settings management

- **API Gateway**:
  - REST API for sign language translation and preferences
  - WebSocket API for real-time transcription streaming

- **Storage**:
  - DynamoDB tables (User Preferences, Cache, Cost Tracking)
  - S3 bucket for sign language models and avatar assets
  - CloudFront CDN for global content delivery

## 📋 Current Implementation Status

### ✅ Completed (Task 1)

- [x] AWS SAM infrastructure template
- [x] DynamoDB table definitions (User Preferences, Cache, Cost Tracking)
- [x] S3 bucket configuration with lifecycle policies
- [x] CloudFront distribution setup
- [x] API Gateway (REST and WebSocket) configuration
- [x] IAM roles and policies
- [x] Lambda function scaffolding:
  - Transcription Service with caching
  - Cost Monitor with budget enforcement
  - Cache Manager with LRU eviction
- [x] Deployment scripts and configuration

### 🚧 In Progress

Working on Task 1: Infrastructure foundation setup

### 📝 Next Steps

1. Complete remaining Lambda functions (Sign Language Translator, Preferences Handler, Health Check)
2. Implement Audio Preprocessor for browser extension
3. Create browser extension UI components
4. Develop Android mobile app
5. Implement property-based tests for correctness properties
6. Deploy and test end-to-end workflows

## 🚀 Getting Started

### Prerequisites

- AWS Account with appropriate permissions
- AWS CLI configured
- AWS SAM CLI installed
- Node.js 18.x or later
- Python 3.9+ (for backend services)
- Android Studio (for mobile app development)

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd accessibility-ai-serverless
   ```

2. **Install dependencies**

   ```bash
   # Install Lambda function dependencies
   cd lambda/transcription-service && npm install
   cd ../cost-monitor && npm install
   cd ../cache-manager && npm install
   ```

3. **Deploy infrastructure**

   ```bash
   cd infrastructure
   chmod +x deploy.sh
   ./deploy.sh dev
   ```

4. **Configure environment**
   - Update `.env` with API endpoints
   - Configure SNS topic subscription for cost alerts
   - Upload sign language models to S3 bucket

### Development

```bash
# Build Lambda functions
cd infrastructure
sam build

# Run local API
sam local start-api

# Run specific Lambda function locally
sam local invoke TranscriptionServiceFunction --event events/transcribe.json

# Deploy to dev environment
./deploy.sh dev

# Deploy to production
./deploy.sh prod
```

## 💰 Cost Optimization Features

### Budget Enforcement

- **80% threshold**: Warning alert sent via SNS
- **95% threshold**: Non-essential features disabled (batch transcription, avatar customization)
- **100% threshold**: New requests rejected until next billing cycle

### Caching Strategy

- **Transcriptions**: 24-hour TTL in DynamoDB
- **Sign language animations**: 7-day TTL in DynamoDB
- **Avatar assets**: 30-day TTL in CloudFront
- **Client-side**: IndexedDB (browser), local storage (mobile)
- **LRU eviction**: Automatic when cache exceeds 5GB

### Cost-Saving Measures

- Client-side audio preprocessing (16kHz mono Opus at 24kbps)
- 3-second audio chunks for AWS Transcribe
- Batch mode for non-real-time requests (50% cost savings)
- Rate limiting: 100 requests/user/hour
- CloudFront price class 100 (North America and Europe only)
- S3 Standard-IA for infrequently accessed models

## 📊 Monitoring

### CloudWatch Metrics

- Total monthly cost
- Projected monthly cost
- Per-service costs
- Lambda invocation counts and errors
- API Gateway latency and request counts
- Cache hit rates

### Alerts

- Budget threshold alerts (80%, 95%, 100%)
- Lambda error rate > 5%
- API Gateway latency > 3 seconds
- Lambda execution time > 10 seconds

## 🔒 Security

- API key authentication for all requests
- HTTPS/WSS for all client-server communication
- AWS KMS encryption for user preferences at rest
- IAM policies for fine-grained access control
- Audio data not persisted after transcription
- Text content not logged in CloudWatch

## 📱 Client Applications

### Browser Extension (Chrome)

- Captures audio from browser tabs
- Real-time transcription overlay
- Sign language avatar window
- Client-side audio preprocessing
- IndexedDB caching for offline access

### Mobile App (Android)

- Microphone audio capture
- Scrollable transcription view
- Sign language avatar rendering
- Offline queue for network interruptions
- Local caching up to 50MB

## 🧪 Testing

### Property-Based Tests (29 total)

Validates universal correctness properties:

- Audio compression reduces size
- WebSocket connection persistence
- Cache TTL expiration
- LRU cache eviction
- Budget enforcement
- And 24 more...

### Unit Tests

- Lambda function logic
- Error handling
- Budget thresholds
- Cache operations
- API routing

### Integration Tests

- End-to-end transcription workflow
- Sign language translation pipeline
- Offline mode and queue processing
- Budget enforcement workflow

## 📚 Documentation

- [Requirements Document](.kiro/specs/accessibility-ai-serverless/requirements.md)
- [Technical Design](.kiro/specs/accessibility-ai-serverless/design.md)
- [Implementation Tasks](.kiro/specs/accessibility-ai-serverless/tasks.md)
- [API Documentation](docs/api.md) (coming soon)
- [Deployment Guide](docs/deployment.md) (coming soon)

## 🤝 Contributing

This project follows spec-driven development methodology. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

[MIT License](LICENSE)

## 🙏 Acknowledgments

Built with AWS serverless services to provide accessible technology within budget constraints.

---

**Budget Status**: Operating within $100/month target
**Supported Users**: Up to 500 active users/month
**Languages**: English, Spanish, French, German, Mandarin
**Sign Languages**: ASL, BSL
