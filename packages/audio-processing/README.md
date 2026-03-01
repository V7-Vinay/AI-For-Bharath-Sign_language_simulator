# @accessibility-ai/audio-processing

Audio processing component with WebRTC integration for the Accessibility AI System.

## Features

- **Multi-source audio capture**: Microphone, tab audio, and system audio
- **Low-latency processing**: Target <50ms audio capture latency
- **Real-time audio level detection**: Using Web Audio API
- **Proper resource cleanup**: Prevents memory leaks
- **WebRTC integration**: Uses MediaStream API for audio capture

## Installation

```bash
npm install @accessibility-ai/audio-processing
```

## Usage

```typescript
import { AudioProcessor } from "@accessibility-ai/audio-processing";
import { AudioSource } from "@accessibility-ai/types";

// Create audio processor instance
const processor = new AudioProcessor();

// Start capturing from microphone
try {
  const stream = await processor.startCapture(AudioSource.MICROPHONE);
  console.log("Audio capture started");

  // Get audio level
  const level = processor.getAudioLevel();
  console.log("Audio level:", level);

  // Stop capture when done
  processor.stopCapture();
} catch (error) {
  console.error("Failed to capture audio:", error);
}
```

## API

### `startCapture(source: AudioSource): Promise<MediaStream>`

Start capturing audio from the specified source.

**Parameters:**

- `source`: Audio source type (MICROPHONE, TAB_AUDIO, or SYSTEM_AUDIO)

**Returns:** Promise that resolves to the captured MediaStream

**Throws:** Error if audio capture fails or permissions are denied

### `stopCapture(): void`

Stop capturing audio and clean up all resources.

### `getAudioLevel(): number`

Get the current audio level (0.0 to 1.0).

**Returns:** Audio level between 0.0 (silence) and 1.0 (maximum)

### `applyNoiseReduction(stream: MediaStream): MediaStream`

Apply noise reduction to the audio stream (placeholder - full implementation in task 2.3).

### `detectSpeechActivity(stream: MediaStream): boolean`

Detect speech activity in the audio stream (placeholder - full implementation in task 2.3).

## Requirements

- Requirements 1.1: Audio capture within 50ms
- Requirements 2.7: Microphone capture support

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Partial support (no tabCapture API)
- Safari: Partial support (limited getDisplayMedia)

## License

MIT
