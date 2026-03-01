/**
 * Audio Capture for Browser Extension
 * 
 * Captures audio from browser tabs with user permission
 * Integrates with AudioPreprocessor for optimization
 * 
 * Requirements: 3.1, 3.6
 */

import { AudioPreprocessor } from './AudioPreprocessor';

export class AudioCapture {
  private audioPreprocessor: AudioPreprocessor;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isRecording: boolean = false;

  constructor() {
    this.audioPreprocessor = new AudioPreprocessor();
  }

  /**
   * Request microphone permissions on extension start
   * Requirement: 3.6
   */
  async requestMicrophonePermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Close the stream immediately after permission is granted
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.error('Microphone permission denied:', error);
      return false;
    }
  }

  /**
   * Capture audio from active tab with user permission
   * Requirement: 3.1
   */
  async captureFromTab(): Promise<void> {
    try {
      // Request tab capture permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      });

      this.mediaStream = stream;

      // Initialize audio preprocessor with the stream
      await this.audioPreprocessor.captureAudio(stream);

      // Create MediaRecorder for capturing audio chunks
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        await this.processAudioChunks();
      };

      this.isRecording = true;
    } catch (error) {
      console.error('Failed to capture audio from tab:', error);
      throw new Error('Audio capture failed: ' + (error as Error).message);
    }
  }

  /**
   * Start recording audio
   */
  startRecording(): void {
    if (!this.mediaRecorder) {
      throw new Error('Audio capture not initialized. Call captureFromTab() first.');
    }

    if (this.isRecording) {
      return;
    }

    // Record in 3-second chunks for streaming
    this.mediaRecorder.start(3000);
    this.isRecording = true;
  }

  /**
   * Stop recording audio
   */
  stopRecording(): void {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    this.audioPreprocessor.stopCapture();
  }

  /**
   * Get audio preprocessor instance
   */
  getPreprocessor(): AudioPreprocessor {
    return this.audioPreprocessor;
  }

  /**
   * Check if currently recording
   */
  isActive(): boolean {
    return this.isRecording;
  }

  /**
   * Get current audio quality
   */
  getAudioQuality(): { quality: 'good' | 'poor'; level: number } {
    return this.audioPreprocessor.checkAudioQuality();
  }

  /**
   * Get daily usage statistics
   */
  getDailyUsage(): number {
    return this.audioPreprocessor.getDailyUsage();
  }

  /**
   * Process captured audio chunks
   */
  private async processAudioChunks(): Promise<void> {
    if (this.audioChunks.length === 0) {
      return;
    }

    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm;codecs=opus' });
    this.audioChunks = [];

    // Convert blob to AudioBuffer for preprocessing
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Compress audio
    const compressed = await this.audioPreprocessor.compressAudio(audioBuffer);

    // Trim silence
    const trimmed = this.audioPreprocessor.trimSilence(audioBuffer);

    // Buffer into chunks
    const chunks = this.audioPreprocessor.bufferChunks(trimmed);

    // Dispatch event with processed chunks
    window.dispatchEvent(new CustomEvent('audio-chunks-ready', {
      detail: { chunks, compressed }
    }));

    await audioContext.close();
  }
}
