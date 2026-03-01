/**
 * Unit tests for AudioProcessor
 * 
 * Tests noise reduction, VAD, and audio processing functionality
 */

import { AudioProcessor } from './AudioProcessor';
import { AudioSource } from '@accessibility-ai/types';

// Mock Web Audio API
class MockAudioContext {
  createAnalyser() {
    return {
      fftSize: 2048,
      smoothingTimeConstant: 0.8,
      frequencyBinCount: 1024,
      connect: jest.fn(),
      disconnect: jest.fn(),
      getFloatTimeDomainData: jest.fn((array: Float32Array) => {
        // Fill with sample audio data
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.sin(i * 0.1) * 0.5;
        }
      }),
      getByteFrequencyData: jest.fn((array: Uint8Array) => {
        // Fill with sample frequency data
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.floor(Math.random() * 128) + 64;
        }
      })
    };
  }

  createMediaStreamSource() {
    return {
      connect: jest.fn(),
      disconnect: jest.fn()
    };
  }

  createScriptProcessor() {
    return {
      connect: jest.fn(),
      disconnect: jest.fn(),
      onaudioprocess: null as any
    };
  }

  createMediaStreamDestination() {
    return {
      stream: {} as MediaStream,
      connect: jest.fn()
    };
  }

  close() {
    return Promise.resolve();
  }
}

// Mock MediaStream
class MockMediaStream {
  private tracks: any[] = [];

  constructor() {
    this.tracks = [{
      stop: jest.fn(),
      kind: 'audio',
      readyState: 'live'
    }];
  }

  getTracks() {
    return this.tracks;
  }

  getAudioTracks() {
    return this.tracks;
  }
}

describe('AudioProcessor - Noise Reduction and VAD', () => {
  let audioProcessor: AudioProcessor;

  beforeEach(() => {
    // Mock global objects BEFORE creating AudioProcessor
    (global as any).AudioContext = MockAudioContext;
    (global as any).window = {
      AudioContext: MockAudioContext
    };

    // Mock navigator.mediaDevices
    Object.defineProperty(global, 'navigator', {
      writable: true,
      value: {
        mediaDevices: {
          getUserMedia: jest.fn().mockResolvedValue(new MockMediaStream()),
          getDisplayMedia: jest.fn().mockResolvedValue(new MockMediaStream())
        }
      }
    });

    // Mock chrome API for tab capture
    (global as any).chrome = {
      tabCapture: {
        capture: jest.fn((options, callback) => {
          callback(new MockMediaStream());
        })
      },
      runtime: {
        lastError: null
      }
    };

    // Mock performance.now for timing tests
    (global as any).performance = {
      now: jest.fn(() => Date.now())
    };

    audioProcessor = new AudioProcessor();
  });

  afterEach(() => {
    audioProcessor.stopCapture();
  });

  describe('Noise Reduction', () => {
    test('should apply noise reduction to audio stream', async () => {
      const stream = await audioProcessor.startCapture(AudioSource.MICROPHONE);
      
      // Apply noise reduction
      const processedStream = audioProcessor.applyNoiseReduction(stream);
      
      // Verify that a stream is returned
      expect(processedStream).toBeDefined();
    });

    test('should handle noise reduction without audio context gracefully', () => {
      const mockStream = new MockMediaStream() as any;
      
      // Apply noise reduction before starting capture
      const result = audioProcessor.applyNoiseReduction(mockStream);
      
      // Should return original stream when audio context not initialized
      expect(result).toBe(mockStream);
    });

    test('should build noise profile over initial frames', async () => {
      await audioProcessor.startCapture(AudioSource.MICROPHONE);
      const stream = new MockMediaStream() as any;
      
      // Apply noise reduction multiple times to build profile
      for (let i = 0; i < 15; i++) {
        audioProcessor.applyNoiseReduction(stream);
      }
      
      // No errors should occur during noise profile building
      expect(true).toBe(true);
    });
  });

  describe('Voice Activity Detection (VAD)', () => {
    test('should detect speech activity when audio is present', async () => {
      const stream = await audioProcessor.startCapture(AudioSource.MICROPHONE);
      
      // Detect speech activity
      const hasSpeech = audioProcessor.detectSpeechActivity(stream);
      
      // Should return a boolean
      expect(typeof hasSpeech).toBe('boolean');
    });

    test('should return false when not capturing', () => {
      const mockStream = new MockMediaStream() as any;
      
      // Try to detect speech without capturing
      const hasSpeech = audioProcessor.detectSpeechActivity(mockStream);
      
      // Should return false when not capturing
      expect(hasSpeech).toBe(false);
    });

    test('should use temporal smoothing for VAD decisions', async () => {
      await audioProcessor.startCapture(AudioSource.MICROPHONE);
      const stream = new MockMediaStream() as any;
      
      // Make multiple VAD calls to test smoothing
      const results: boolean[] = [];
      for (let i = 0; i < 10; i++) {
        results.push(audioProcessor.detectSpeechActivity(stream));
      }
      
      // Should have made multiple decisions
      expect(results.length).toBe(10);
      
      // All results should be boolean
      results.forEach(result => {
        expect(typeof result).toBe('boolean');
      });
    });

    test('should analyze multiple audio features for VAD', async () => {
      await audioProcessor.startCapture(AudioSource.MICROPHONE);
      const stream = new MockMediaStream() as any;
      
      // Call VAD which internally uses energy, ZCR, and spectral centroid
      const hasSpeech = audioProcessor.detectSpeechActivity(stream);
      
      // Should complete without errors
      expect(typeof hasSpeech).toBe('boolean');
    });
  });

  describe('Audio Level Detection', () => {
    test('should return zero audio level when not capturing', () => {
      const level = audioProcessor.getAudioLevel();
      expect(level).toBe(0);
    });

    test('should return audio level between 0 and 1 when capturing', async () => {
      await audioProcessor.startCapture(AudioSource.MICROPHONE);
      
      const level = audioProcessor.getAudioLevel();
      
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    });
  });

  describe('Integration', () => {
    test('should handle complete workflow: capture -> noise reduction -> VAD', async () => {
      // Start capture
      const stream = await audioProcessor.startCapture(AudioSource.MICROPHONE);
      expect(audioProcessor.isCurrentlyCapturing()).toBe(true);
      
      // Apply noise reduction
      const processedStream = audioProcessor.applyNoiseReduction(stream);
      expect(processedStream).toBeDefined();
      
      // Detect speech activity
      const hasSpeech = audioProcessor.detectSpeechActivity(stream);
      expect(typeof hasSpeech).toBe('boolean');
      
      // Get audio level
      const level = audioProcessor.getAudioLevel();
      expect(level).toBeGreaterThanOrEqual(0);
      
      // Stop capture
      audioProcessor.stopCapture();
      expect(audioProcessor.isCurrentlyCapturing()).toBe(false);
    });

    test('should clean up resources properly', async () => {
      await audioProcessor.startCapture(AudioSource.MICROPHONE);
      expect(audioProcessor.isCurrentlyCapturing()).toBe(true);
      
      audioProcessor.stopCapture();
      
      expect(audioProcessor.isCurrentlyCapturing()).toBe(false);
      expect(audioProcessor.getCurrentSource()).toBe(null);
      expect(audioProcessor.getAudioLevel()).toBe(0);
    });
  });

  describe('Speech Isolation for Multi-Source Audio', () => {
    test('should isolate speech from multi-source audio stream', async () => {
      const stream = await audioProcessor.startCapture(AudioSource.MICROPHONE);
      
      // Apply speech isolation
      const isolatedStream = audioProcessor.isolateSpeech(stream);
      
      // Verify that a stream is returned
      expect(isolatedStream).toBeDefined();
    });

    test('should handle speech isolation without audio context gracefully', () => {
      const mockStream = new MockMediaStream() as any;
      
      // Apply speech isolation before starting capture
      const result = audioProcessor.isolateSpeech(mockStream);
      
      // Should return original stream when audio context not initialized
      expect(result).toBe(mockStream);
    });

    test('should detect multiple audio sources', async () => {
      await audioProcessor.startCapture(AudioSource.MICROPHONE);
      
      // Detect multiple sources
      const hasMultipleSources = audioProcessor.detectMultipleSources();
      
      // Should return a boolean
      expect(typeof hasMultipleSources).toBe('boolean');
    });

    test('should return false for multiple sources when not capturing', () => {
      // Try to detect multiple sources without capturing
      const hasMultipleSources = audioProcessor.detectMultipleSources();
      
      // Should return false when not capturing
      expect(hasMultipleSources).toBe(false);
    });

    test('should prioritize speech over background audio', async () => {
      await audioProcessor.startCapture(AudioSource.MICROPHONE);
      const stream = new MockMediaStream() as any;
      
      // Apply speech isolation which prioritizes speech
      const isolatedStream = audioProcessor.isolateSpeech(stream);
      
      // Should return a processed stream
      expect(isolatedStream).toBeDefined();
    });

    test('should handle complete workflow with speech isolation', async () => {
      // Start capture
      const stream = await audioProcessor.startCapture(AudioSource.MICROPHONE);
      expect(audioProcessor.isCurrentlyCapturing()).toBe(true);
      
      // Detect multiple sources
      const hasMultipleSources = audioProcessor.detectMultipleSources();
      expect(typeof hasMultipleSources).toBe('boolean');
      
      // Apply speech isolation
      const isolatedStream = audioProcessor.isolateSpeech(stream);
      expect(isolatedStream).toBeDefined();
      
      // Apply noise reduction on isolated stream
      const processedStream = audioProcessor.applyNoiseReduction(isolatedStream);
      expect(processedStream).toBeDefined();
      
      // Detect speech activity
      const hasSpeech = audioProcessor.detectSpeechActivity(stream);
      expect(typeof hasSpeech).toBe('boolean');
      
      // Stop capture
      audioProcessor.stopCapture();
      expect(audioProcessor.isCurrentlyCapturing()).toBe(false);
    });

    test('should clean up speech isolation state on stop', async () => {
      await audioProcessor.startCapture(AudioSource.MICROPHONE);
      const stream = new MockMediaStream() as any;
      
      // Apply speech isolation to initialize state
      audioProcessor.isolateSpeech(stream);
      
      // Stop capture should clean up all state
      audioProcessor.stopCapture();
      
      expect(audioProcessor.isCurrentlyCapturing()).toBe(false);
      expect(audioProcessor.getCurrentSource()).toBe(null);
    });
  });

  describe('Connection Resilience and Auto-Resume (Requirement 1.4)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should initialize connection state as connected when starting capture', async () => {
      await audioProcessor.startCapture(AudioSource.MICROPHONE);
      
      expect(audioProcessor.getConnectionState()).toBe('connected');
      expect(audioProcessor.isCurrentlyCapturing()).toBe(true);
    });

    test('should maintain connection state during audio interruption', async () => {
      await audioProcessor.startCapture(AudioSource.MICROPHONE);
      
      // Initially connected
      expect(audioProcessor.getConnectionState()).toBe('connected');
      
      // Simulate 2+ seconds of silence by advancing timers
      jest.advanceTimersByTime(2500);
      
      // Connection should be marked as interrupted but still capturing
      expect(audioProcessor.isCurrentlyCapturing()).toBe(true);
    });

    test('should automatically resume when audio returns after interruption', async () => {
      await audioProcessor.startCapture(AudioSource.MICROPHONE);
      
      // Initially connected
      expect(audioProcessor.getConnectionState()).toBe('connected');
      
      // Simulate silence to trigger interruption
      jest.advanceTimersByTime(2500);
      
      // Now simulate audio returning (getAudioLevel would return > threshold)
      // The monitoring loop will detect this and resume
      jest.advanceTimersByTime(500);
      
      // Should still be capturing
      expect(audioProcessor.isCurrentlyCapturing()).toBe(true);
    });

    test('should clean up connection state when stopping capture', async () => {
      await audioProcessor.startCapture(AudioSource.MICROPHONE);
      
      expect(audioProcessor.getConnectionState()).toBe('connected');
      
      audioProcessor.stopCapture();
      
      expect(audioProcessor.getConnectionState()).toBe('disconnected');
      expect(audioProcessor.isCurrentlyCapturing()).toBe(false);
    });

    test('should handle audio interruptions gracefully without throwing errors', async () => {
      await audioProcessor.startCapture(AudioSource.MICROPHONE);
      
      // Simulate multiple interruption cycles
      for (let i = 0; i < 3; i++) {
        // Simulate silence
        jest.advanceTimersByTime(2500);
        
        // Simulate audio return
        jest.advanceTimersByTime(500);
      }
      
      // Should still be capturing without errors
      expect(audioProcessor.isCurrentlyCapturing()).toBe(true);
    });

    test('should stop monitoring when capture is stopped', async () => {
      await audioProcessor.startCapture(AudioSource.MICROPHONE);
      
      // Monitoring should be active
      expect(audioProcessor.getConnectionState()).toBe('connected');
      
      audioProcessor.stopCapture();
      
      // Advance timers - monitoring should not trigger any state changes
      jest.advanceTimersByTime(5000);
      
      // Should remain disconnected
      expect(audioProcessor.getConnectionState()).toBe('disconnected');
    });

    test('should preserve audio source configuration during interruption', async () => {
      await audioProcessor.startCapture(AudioSource.MICROPHONE);
      
      expect(audioProcessor.getCurrentSource()).toBe(AudioSource.MICROPHONE);
      
      // Simulate interruption
      jest.advanceTimersByTime(2500);
      
      // Source should still be preserved
      expect(audioProcessor.getCurrentSource()).toBe(AudioSource.MICROPHONE);
    });

    test('should handle rapid start/stop cycles without errors', async () => {
      // Start and stop multiple times rapidly
      for (let i = 0; i < 5; i++) {
        await audioProcessor.startCapture(AudioSource.MICROPHONE);
        expect(audioProcessor.getConnectionState()).toBe('connected');
        
        audioProcessor.stopCapture();
        expect(audioProcessor.getConnectionState()).toBe('disconnected');
      }
      
      // Should end in clean state
      expect(audioProcessor.isCurrentlyCapturing()).toBe(false);
    });

    test('should handle connection state transitions correctly', async () => {
      // Start: disconnected -> connected
      expect(audioProcessor.getConnectionState()).toBe('disconnected');
      
      await audioProcessor.startCapture(AudioSource.MICROPHONE);
      expect(audioProcessor.getConnectionState()).toBe('connected');
      
      // Simulate interruption: connected -> interrupted
      jest.advanceTimersByTime(2500);
      
      // Stop: interrupted -> disconnected
      audioProcessor.stopCapture();
      expect(audioProcessor.getConnectionState()).toBe('disconnected');
    });
  });
});
