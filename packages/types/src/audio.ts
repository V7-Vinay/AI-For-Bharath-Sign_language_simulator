/**
 * Audio data models for the Accessibility AI System
 */

export enum AudioSource {
  MICROPHONE = 'microphone',
  TAB_AUDIO = 'tab_audio',
  SYSTEM_AUDIO = 'system_audio'
}

export enum AudioFormat {
  PCM = 'pcm',
  OPUS = 'opus',
  AAC = 'aac',
  WAV = 'wav'
}

export enum AudioQuality {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  ULTRA = 'ultra'
}

export interface AudioChunk {
  data: Float32Array;
  sampleRate: number;
  channels: number;
  timestamp: number;
  duration: number;
  source: AudioSource;
}

export interface AudioMetadata {
  format: AudioFormat;
  bitrate: number;
  quality: AudioQuality;
  noiseLevel: number;
  speechProbability: number;
}

export interface AudioProcessor {
  startCapture(source: AudioSource): Promise<MediaStream>;
  stopCapture(): void;
  applyNoiseReduction(stream: MediaStream): MediaStream;
  detectSpeechActivity(stream: MediaStream): boolean;
  getAudioLevel(): number;
}
