/**
 * Unit tests for audio types
 */

import { AudioSource, AudioFormat, AudioQuality, AudioChunk } from './audio';

describe('Audio Types', () => {
  describe('AudioChunk', () => {
    it('should create a valid audio chunk', () => {
      const audioChunk: AudioChunk = {
        data: new Float32Array([0.1, 0.2, 0.3]),
        sampleRate: 48000,
        channels: 1,
        timestamp: Date.now(),
        duration: 100,
        source: AudioSource.MICROPHONE
      };

      expect(audioChunk.data).toBeInstanceOf(Float32Array);
      expect(audioChunk.sampleRate).toBe(48000);
      expect(audioChunk.channels).toBe(1);
      expect(audioChunk.source).toBe(AudioSource.MICROPHONE);
    });

    it('should support stereo audio', () => {
      const audioChunk: AudioChunk = {
        data: new Float32Array(2048),
        sampleRate: 44100,
        channels: 2,
        timestamp: Date.now(),
        duration: 50,
        source: AudioSource.TAB_AUDIO
      };

      expect(audioChunk.channels).toBe(2);
    });
  });

  describe('AudioSource enum', () => {
    it('should have correct values', () => {
      expect(AudioSource.MICROPHONE).toBe('microphone');
      expect(AudioSource.TAB_AUDIO).toBe('tab_audio');
      expect(AudioSource.SYSTEM_AUDIO).toBe('system_audio');
    });
  });

  describe('AudioFormat enum', () => {
    it('should have correct values', () => {
      expect(AudioFormat.PCM).toBe('pcm');
      expect(AudioFormat.OPUS).toBe('opus');
      expect(AudioFormat.AAC).toBe('aac');
      expect(AudioFormat.WAV).toBe('wav');
    });
  });

  describe('AudioQuality enum', () => {
    it('should have correct values', () => {
      expect(AudioQuality.LOW).toBe('low');
      expect(AudioQuality.MEDIUM).toBe('medium');
      expect(AudioQuality.HIGH).toBe('high');
      expect(AudioQuality.ULTRA).toBe('ultra');
    });
  });
});
