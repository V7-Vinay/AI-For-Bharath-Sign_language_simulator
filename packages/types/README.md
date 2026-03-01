# @accessibility-ai/types

Shared TypeScript types and interfaces for the Accessibility AI System.

## Overview

This package contains all core data models and type definitions used across the system:

- **Audio Types**: Audio processing, capture, and streaming interfaces
- **Transcription Types**: Speech-to-text and NLP data models
- **Sign Language Types**: Sign language translation and gesture data
- **Avatar Types**: 3D avatar rendering and animation interfaces
- **User Preferences**: Configuration and personalization models
- **Error Types**: Comprehensive error handling definitions

## Installation

```bash
npm install @accessibility-ai/types
```

## Usage

```typescript
import { AudioChunk, TranscriptionSegment, SignLanguageData, UserPreferences } from '@accessibility-ai/types';

const audioChunk: AudioChunk = {
  data: new Float32Array(1024),
  sampleRate: 48000,
  channels: 1,
  timestamp: Date.now(),
  duration: 100,
  source: AudioSource.MICROPHONE
};
```

## Development

```bash
# Build the package
npm run build

# Run type checking
npm run type-check

# Run tests
npm test
```
