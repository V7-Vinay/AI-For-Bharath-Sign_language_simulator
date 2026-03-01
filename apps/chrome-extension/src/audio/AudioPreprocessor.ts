/**
 * Audio Preprocessor for Serverless Architecture
 * 
 * Client-side audio preprocessing optimized for cost reduction:
 * - Compress to 16kHz mono Opus at 24kbps
 * - Trim silence segments longer than 2 seconds
 * - Buffer audio in 3-second chunks
 * - Apply noise reduction on client side
 * 
 * Requirements: 1.1, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

export interface AudioFormat {
  sampleRate: number;
  channels: number;
  codec: 'opus' | 'pcm';
  bitrate: number;
}

export interface AudioChunk {
  data: ArrayBuffer;
  format: AudioFormat;
  duration: number;
  timestamp: number;
  sessionId: string;
}

export interface CompressedAudio {
  data: ArrayBuffer;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  format: AudioFormat;
}

export class AudioPreprocessor {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private isCapturing: boolean = false;
  
  // Noise reduction state
  private noiseProfile: Float32Array | null = null;
  private noiseEstimationFrames: number = 0;
  private readonly NOISE_ESTIMATION_DURATION = 10;
  private readonly SPECTRAL_FLOOR = 0.002;
  
  // Silence detection
  private readonly SILENCE_THRESHOLD = -40; // dB
  private readonly SILENCE_DURATION_MS = 2000; // 2 seconds
  
  // Audio format configuration (Requirements: 8.1, 8.2)
  private readonly TARGET_SAMPLE_RATE = 16000; // 16kHz
  private readonly TARGET_CHANNELS = 1; // Mono
  private readonly TARGET_BITRATE = 24000; // 24kbps
  private readonly CHUNK_DURATION_MS = 3000; // 3 seconds
  
  // Daily usage tracking (Requirement: 8.7)
  private dailyUsageMs: number = 0;
  private readonly MAX_DAILY_USAGE_MS = 8 * 60 * 60 * 1000; // 8 hours
  private usageStartTime: number = 0;

  /**
   * Capture audio from MediaStream
   * Requirement: 1.1, 3.1, 3.6
   */
  async captureAudio(source: MediaStream): Promise<void> {
    // Check daily usage limit (Requirement: 8.7)
    if (this.dailyUsageMs >= this.MAX_DAILY_USAGE_MS) {
      throw new Error('Daily usage limit of 8 hours exceeded');
    }

    this.mediaStream = source;
    
    // Initialize audio context with target sample rate
    this.audioContext = new AudioContext({ sampleRate: this.TARGET_SAMPLE_RATE });
    
    // Create source node
    this.sourceNode = this.audioContext.createMediaStreamSource(source);
    
    // Create analyser for level detection and quality checks
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 2048;
    
    this.sourceNode.connect(this.analyserNode);
    
    this.isCapturing = true;
    this.usageStartTime = Date.now();
  }

  /**
   * Compress audio to 16kHz mono Opus format at 24kbps
   * Requirements: 1.1, 8.1, 8.2
   */
  async compressAudio(audio: AudioBuffer): Promise<CompressedAudio> {
    const originalSize = audio.length * audio.numberOfChannels * 4; // 32-bit float
    
    // Convert to mono if needed
    const monoBuffer = this.convertToMono(audio);
    
    // Resample to 16kHz if needed
    const resampledBuffer = await this.resample(monoBuffer, this.TARGET_SAMPLE_RATE);
    
    // Apply noise reduction (Requirement: 8.6)
    const cleanedBuffer = this.applyNoiseReduction(resampledBuffer);
    
    // Encode to Opus (simulated - actual Opus encoding would use a library)
    const compressedData = this.encodeToOpus(cleanedBuffer, this.TARGET_BITRATE);
    
    const compressedSize = compressedData.byteLength;
    
    return {
      data: compressedData,
      originalSize,
      compressedSize,
      compressionRatio: originalSize / compressedSize,
      format: {
        sampleRate: this.TARGET_SAMPLE_RATE,
        channels: this.TARGET_CHANNELS,
        codec: 'opus',
        bitrate: this.TARGET_BITRATE
      }
    };
  }

  /**
   * Trim silence segments longer than 2 seconds
   * Requirement: 8.3
   */
  trimSilence(audio: AudioBuffer, threshold: number = this.SILENCE_THRESHOLD): AudioBuffer {
    const channelData = audio.getChannelData(0);
    const sampleRate = audio.sampleRate;
    const silenceDurationSamples = (this.SILENCE_DURATION_MS / 1000) * sampleRate;
    
    // Convert dB threshold to linear amplitude
    const amplitudeThreshold = Math.pow(10, threshold / 20);
    
    // Find non-silent segments
    const segments: { start: number; end: number }[] = [];
    let segmentStart = -1;
    let silentSamples = 0;
    
    for (let i = 0; i < channelData.length; i++) {
      const amplitude = Math.abs(channelData[i]);
      
      if (amplitude > amplitudeThreshold) {
        // Audio detected
        if (segmentStart === -1) {
          segmentStart = i;
        }
        silentSamples = 0;
      } else {
        // Silence detected
        silentSamples++;
        
        if (silentSamples >= silenceDurationSamples && segmentStart !== -1) {
          // End of segment (silence longer than threshold)
          segments.push({
            start: segmentStart,
            end: i - silenceDurationSamples
          });
          segmentStart = -1;
        }
      }
    }
    
    // Add final segment if exists
    if (segmentStart !== -1) {
      segments.push({
        start: segmentStart,
        end: channelData.length
      });
    }
    
    // If no segments found, return empty buffer
    if (segments.length === 0) {
      return this.audioContext!.createBuffer(1, 1, sampleRate);
    }
    
    // Calculate total length of non-silent audio
    const totalLength = segments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
    
    // Create new buffer with trimmed audio
    const trimmedBuffer = this.audioContext!.createBuffer(1, totalLength, sampleRate);
    const trimmedData = trimmedBuffer.getChannelData(0);
    
    let offset = 0;
    for (const segment of segments) {
      const segmentLength = segment.end - segment.start;
      trimmedData.set(channelData.subarray(segment.start, segment.end), offset);
      offset += segmentLength;
    }
    
    return trimmedBuffer;
  }

  /**
   * Buffer audio into 3-second chunks for streaming
   * Requirement: 1.7, 8.4
   */
  bufferChunks(audio: AudioBuffer, chunkSize: number = this.CHUNK_DURATION_MS): AudioChunk[] {
    const sampleRate = audio.sampleRate;
    const samplesPerChunk = (chunkSize / 1000) * sampleRate;
    const channelData = audio.getChannelData(0);
    const chunks: AudioChunk[] = [];
    
    const sessionId = `session-${Date.now()}`;
    
    for (let i = 0; i < channelData.length; i += samplesPerChunk) {
      const end = Math.min(i + samplesPerChunk, channelData.length);
      const chunkData = channelData.slice(i, end);
      
      // Convert Float32Array to ArrayBuffer
      const buffer = new ArrayBuffer(chunkData.length * 4);
      const view = new Float32Array(buffer);
      view.set(chunkData);
      
      chunks.push({
        data: buffer,
        format: {
          sampleRate: this.TARGET_SAMPLE_RATE,
          channels: this.TARGET_CHANNELS,
          codec: 'opus',
          bitrate: this.TARGET_BITRATE
        },
        duration: (end - i) / sampleRate * 1000,
        timestamp: Date.now() + (i / sampleRate * 1000),
        sessionId
      });
    }
    
    return chunks;
  }

  /**
   * Display quality warning when audio is below -40dB
   * Requirement: 8.5
   */
  checkAudioQuality(): { quality: 'good' | 'poor'; level: number } {
    if (!this.analyserNode) {
      return { quality: 'good', level: 0 };
    }
    
    const bufferLength = this.analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyserNode.getByteFrequencyData(dataArray);
    
    // Calculate RMS level
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const normalized = dataArray[i] / 255.0;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / bufferLength);
    
    // Convert to dB
    const db = 20 * Math.log10(rms + 0.0001);
    
    return {
      quality: db < this.SILENCE_THRESHOLD ? 'poor' : 'good',
      level: db
    };
  }

  /**
   * Get current daily usage in milliseconds
   */
  getDailyUsage(): number {
    if (this.isCapturing) {
      return this.dailyUsageMs + (Date.now() - this.usageStartTime);
    }
    return this.dailyUsageMs;
  }

  /**
   * Stop capturing and update usage tracking
   */
  stopCapture(): void {
    if (this.isCapturing && this.usageStartTime > 0) {
      this.dailyUsageMs += Date.now() - this.usageStartTime;
      this.usageStartTime = 0;
    }
    
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.isCapturing = false;
    this.mediaStream = null;
  }

  // Private helper methods

  private convertToMono(buffer: AudioBuffer): AudioBuffer {
    if (buffer.numberOfChannels === 1) {
      return buffer;
    }
    
    const monoBuffer = this.audioContext!.createBuffer(
      1,
      buffer.length,
      buffer.sampleRate
    );
    
    const monoData = monoBuffer.getChannelData(0);
    
    // Average all channels
    for (let i = 0; i < buffer.length; i++) {
      let sum = 0;
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        sum += buffer.getChannelData(channel)[i];
      }
      monoData[i] = sum / buffer.numberOfChannels;
    }
    
    return monoBuffer;
  }

  private async resample(buffer: AudioBuffer, targetRate: number): Promise<AudioBuffer> {
    if (buffer.sampleRate === targetRate) {
      return buffer;
    }
    
    const offlineContext = new OfflineAudioContext(
      buffer.numberOfChannels,
      Math.ceil(buffer.duration * targetRate),
      targetRate
    );
    
    const source = offlineContext.createBufferSource();
    source.buffer = buffer;
    source.connect(offlineContext.destination);
    source.start(0);
    
    return await offlineContext.startRendering();
  }

  private applyNoiseReduction(buffer: AudioBuffer): AudioBuffer {
    const channelData = buffer.getChannelData(0);
    const outputBuffer = this.audioContext!.createBuffer(
      1,
      buffer.length,
      buffer.sampleRate
    );
    const outputData = outputBuffer.getChannelData(0);
    
    // Simple spectral subtraction
    const spectrum = this.computeSpectrum(channelData);
    
    if (!this.noiseProfile && this.noiseEstimationFrames < this.NOISE_ESTIMATION_DURATION) {
      this.updateNoiseProfile(channelData);
      outputData.set(channelData);
      return outputBuffer;
    }
    
    if (this.noiseProfile) {
      for (let i = 0; i < spectrum.length; i++) {
        spectrum[i] = Math.max(
          spectrum[i] - this.noiseProfile[i],
          this.SPECTRAL_FLOOR
        );
      }
    }
    
    this.spectrumToTimeDomain(spectrum, outputData);
    return outputBuffer;
  }

  private computeSpectrum(audioData: Float32Array): Float32Array {
    const numBands = 32;
    const spectrum = new Float32Array(numBands);
    const samplesPerBand = Math.floor(audioData.length / numBands);
    
    for (let band = 0; band < numBands; band++) {
      let sum = 0;
      const start = band * samplesPerBand;
      const end = Math.min(start + samplesPerBand, audioData.length);
      
      for (let i = start; i < end; i++) {
        sum += audioData[i] * audioData[i];
      }
      
      spectrum[band] = Math.sqrt(sum / samplesPerBand);
    }
    
    return spectrum;
  }

  private updateNoiseProfile(audioData: Float32Array): void {
    const spectrum = this.computeSpectrum(audioData);
    
    if (!this.noiseProfile) {
      this.noiseProfile = new Float32Array(spectrum.length);
      this.noiseProfile.set(spectrum);
    } else {
      for (let i = 0; i < spectrum.length; i++) {
        this.noiseProfile[i] = (this.noiseProfile[i] * this.noiseEstimationFrames + spectrum[i]) / 
                               (this.noiseEstimationFrames + 1);
      }
    }
    
    this.noiseEstimationFrames++;
  }

  private spectrumToTimeDomain(spectrum: Float32Array, outputData: Float32Array): void {
    const samplesPerBand = Math.floor(outputData.length / spectrum.length);
    
    for (let band = 0; band < spectrum.length; band++) {
      const magnitude = spectrum[band];
      const start = band * samplesPerBand;
      const end = Math.min(start + samplesPerBand, outputData.length);
      
      for (let i = start; i < end; i++) {
        const phase = Math.sin((i / outputData.length) * Math.PI * 2 * band);
        outputData[i] = magnitude * phase * 0.5;
      }
    }
  }

  private encodeToOpus(buffer: AudioBuffer, bitrate: number): ArrayBuffer {
    // Simplified Opus encoding simulation
    // In production, use a proper Opus encoder library like opus-recorder
    const channelData = buffer.getChannelData(0);
    
    // Calculate compressed size based on bitrate
    const durationSeconds = buffer.duration;
    const compressedSize = Math.ceil((bitrate / 8) * durationSeconds);
    
    // Create compressed buffer (simplified - actual Opus encoding would be different)
    const compressed = new ArrayBuffer(compressedSize);
    const view = new Uint8Array(compressed);
    
    // Simple compression: downsample and quantize
    const compressionRatio = channelData.length / compressedSize;
    for (let i = 0; i < compressedSize; i++) {
      const sourceIndex = Math.floor(i * compressionRatio);
      const sample = channelData[sourceIndex];
      // Quantize to 8-bit
      view[i] = Math.floor((sample + 1) * 127.5);
    }
    
    return compressed;
  }
}
