/**
 * AudioProcessor - Core audio processing component with WebRTC integration
 * 
 * This class handles audio capture from various sources (microphone, tab audio)
 * with minimal latency (<50ms target) using WebRTC MediaStream API and Web Audio API.
 * 
 * Requirements: 1.1, 2.7
 */

import { AudioSource, AudioProcessor as IAudioProcessor } from '@accessibility-ai/types';

export class AudioProcessor implements IAudioProcessor {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private isCapturing: boolean = false;
  private currentSource: AudioSource | null = null;

  // Noise reduction and VAD state
  private noiseProfile: Float32Array | null = null;
  private noiseEstimationFrames: number = 0;
  private readonly NOISE_ESTIMATION_DURATION = 10; // frames to estimate noise
  private readonly VAD_THRESHOLD = 0.02; // Voice activity detection threshold
  private readonly SPECTRAL_FLOOR = 0.002; // Minimum spectral value to prevent over-suppression
  private vadHistory: boolean[] = []; // Track VAD history for smoothing
  private readonly VAD_HISTORY_LENGTH = 5; // Number of frames to consider for VAD smoothing

  // Speech isolation state for multi-source audio (Requirement 1.3)
  private speechProfile: Float32Array | null = null;
  private backgroundProfile: Float32Array | null = null;
  private readonly SPEECH_FREQ_MIN = 85; // Hz - Minimum speech frequency
  private readonly SPEECH_FREQ_MAX = 3400; // Hz - Maximum speech frequency
  private readonly SPEECH_PRIORITY_GAIN = 2.0; // Amplification for speech content
  private readonly BACKGROUND_ATTENUATION = 0.3; // Reduction for background audio

  // Connection resilience state (Requirement 1.4)
  private connectionState: 'connected' | 'interrupted' | 'disconnected' = 'disconnected';
  private lastAudioActivityTime: number = 0;
  private silenceDetectionTimer: NodeJS.Timeout | null = null;
  private readonly SILENCE_THRESHOLD_MS = 2000; // 2 seconds of silence before marking as interrupted
  private readonly AUDIO_ACTIVITY_CHECK_INTERVAL_MS = 100; // Check for audio activity every 100ms
  private audioActivityMonitor: NodeJS.Timeout | null = null;
  private reconnectionAttempts: number = 0;
  private readonly MAX_RECONNECTION_ATTEMPTS = 3;
  private savedCaptureConfig: { source: AudioSource } | null = null;

  /**
   * Start capturing audio from the specified source
   * 
   * @param source - The audio source to capture from (microphone, tab_audio, system_audio)
   * @returns Promise<MediaStream> - The captured media stream
   * @throws Error if audio capture fails or permissions are denied
   * 
   * Requirements: 1.1 (Audio capture within 50ms), 2.7 (Microphone capture)
   */
  async startCapture(source: AudioSource): Promise<MediaStream> {
    // Stop any existing capture first
    if (this.isCapturing) {
      this.stopCapture();
    }

    try {
      const startTime = performance.now();
      
      // Get media stream based on source type
      switch (source) {
        case AudioSource.MICROPHONE:
          this.mediaStream = await this.captureMicrophone();
          break;
        
        case AudioSource.TAB_AUDIO:
          this.mediaStream = await this.captureTabAudio();
          break;
        
        case AudioSource.SYSTEM_AUDIO:
          this.mediaStream = await this.captureSystemAudio();
          break;
        
        default:
          throw new Error(`Unsupported audio source: ${source}`);
      }

      // Initialize Web Audio API for audio level detection
      this.initializeAudioContext(this.mediaStream);

      this.isCapturing = true;
      this.currentSource = source;

      // Initialize connection resilience (Requirement 1.4)
      this.connectionState = 'connected';
      this.lastAudioActivityTime = Date.now();
      this.savedCaptureConfig = { source };
      this.startAudioActivityMonitoring();

      const captureTime = performance.now() - startTime;
      
      // Log capture time for monitoring (should be <50ms per requirement 1.1)
      if (captureTime > 50) {
        console.warn(`Audio capture took ${captureTime.toFixed(2)}ms, exceeding 50ms target`);
      }

      return this.mediaStream;
    } catch (error) {
      this.cleanup();
      throw new Error(`Failed to start audio capture from ${source}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stop capturing audio and clean up resources
   * 
   * Properly releases all media streams, audio contexts, and associated resources
   * to prevent memory leaks and ensure clean shutdown.
   */
  stopCapture(): void {
    this.stopAudioActivityMonitoring();
    this.cleanup();
    this.isCapturing = false;
    this.currentSource = null;
    this.connectionState = 'disconnected';
    this.savedCaptureConfig = null;
    this.reconnectionAttempts = 0;
  }

  /**
   * Apply noise reduction to the audio stream
   * 
   * Implements spectral subtraction for noise cancellation with adaptive filtering.
   * The algorithm:
   * 1. Estimates noise profile from initial frames or continuous background
   * 2. Applies spectral subtraction in frequency domain
   * 3. Uses adaptive filtering based on current noise levels
   * 
   * Requirements: 1.2 (Noise reduction for low quality audio), 3.4 (Noise filtering)
   * 
   * @param stream - The input media stream
   * @returns MediaStream - The processed stream with noise reduction applied
   */
  applyNoiseReduction(stream: MediaStream): MediaStream {
    if (!this.audioContext) {
      console.warn('Audio context not initialized, returning original stream');
      return stream;
    }

    try {
      // Create a new destination for the processed audio
      const destination = this.audioContext.createMediaStreamDestination();
      
      // Create source from input stream
      const source = this.audioContext.createMediaStreamSource(stream);
      
      // Create script processor for custom audio processing
      // Using 4096 buffer size for good balance between latency and processing quality
      const bufferSize = 4096;
      const scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
      
      scriptProcessor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        const outputData = event.outputBuffer.getChannelData(0);
        
        // Apply spectral subtraction noise reduction
        this.applySpectralSubtraction(inputData, outputData);
      };
      
      // Connect the audio graph: source -> processor -> destination
      source.connect(scriptProcessor);
      scriptProcessor.connect(destination);
      
      return destination.stream;
    } catch (error) {
      console.error('Failed to apply noise reduction:', error);
      return stream; // Return original stream on error
    }
  }

  /**
   * Apply spectral subtraction for noise reduction
   * 
   * This method performs noise reduction in the frequency domain using
   * spectral subtraction with adaptive filtering.
   * 
   * @private
   * @param inputData - Input audio samples
   * @param outputData - Output buffer for processed audio
   */
  private applySpectralSubtraction(inputData: Float32Array, outputData: Float32Array): void {
    // Build or update noise profile from initial frames
    if (this.noiseEstimationFrames < this.NOISE_ESTIMATION_DURATION) {
      this.updateNoiseProfile(inputData);
      // During noise estimation, pass through with minimal processing
      outputData.set(inputData);
      return;
    }
    
    // If no noise profile yet, pass through
    if (!this.noiseProfile) {
      outputData.set(inputData);
      return;
    }
    
    // Apply FFT (simplified - using magnitude estimation)
    const spectrum = this.computeSpectrum(inputData);
    
    // Subtract noise profile with adaptive gain
    const noiseLevel = this.estimateCurrentNoiseLevel(spectrum);
    const adaptiveGain = this.calculateAdaptiveGain(noiseLevel);
    
    for (let i = 0; i < spectrum.length; i++) {
      // Spectral subtraction with over-subtraction factor
      const cleanMagnitude = Math.max(
        spectrum[i] - (this.noiseProfile[i] * adaptiveGain),
        this.SPECTRAL_FLOOR
      );
      spectrum[i] = cleanMagnitude;
    }
    
    // Convert back to time domain (simplified inverse)
    this.spectrumToTimeDomain(spectrum, outputData);
  }

  /**
   * Update noise profile estimation
   * 
   * Builds a noise profile from the initial frames of audio, assuming
   * the first frames contain primarily background noise.
   * 
   * @private
   * @param audioData - Audio samples to analyze
   */
  private updateNoiseProfile(audioData: Float32Array): void {
    const spectrum = this.computeSpectrum(audioData);
    
    if (!this.noiseProfile) {
      this.noiseProfile = new Float32Array(spectrum.length);
      this.noiseProfile.set(spectrum);
    } else {
      // Average with existing noise profile
      for (let i = 0; i < spectrum.length; i++) {
        this.noiseProfile[i] = (this.noiseProfile[i] * this.noiseEstimationFrames + spectrum[i]) / 
                               (this.noiseEstimationFrames + 1);
      }
    }
    
    this.noiseEstimationFrames++;
  }

  /**
   * Compute magnitude spectrum from time-domain audio
   * 
   * Simplified spectral analysis using RMS in frequency bands.
   * For production, this would use a proper FFT implementation.
   * 
   * @private
   * @param audioData - Time-domain audio samples
   * @returns Float32Array - Magnitude spectrum
   */
  private computeSpectrum(audioData: Float32Array): Float32Array {
    const numBands = 32; // Simplified frequency bands
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

  /**
   * Estimate current noise level from spectrum
   * 
   * @private
   * @param spectrum - Current audio spectrum
   * @returns number - Estimated noise level (0.0 to 1.0)
   */
  private estimateCurrentNoiseLevel(spectrum: Float32Array): number {
    if (!this.noiseProfile) return 0;
    
    let totalNoise = 0;
    for (let i = 0; i < spectrum.length; i++) {
      totalNoise += Math.min(spectrum[i], this.noiseProfile[i]);
    }
    
    return totalNoise / spectrum.length;
  }

  /**
   * Calculate adaptive gain for noise reduction
   * 
   * Higher noise levels result in more aggressive noise reduction.
   * 
   * @private
   * @param noiseLevel - Current estimated noise level
   * @returns number - Adaptive gain factor (1.0 to 3.0)
   */
  private calculateAdaptiveGain(noiseLevel: number): number {
    // Scale gain from 1.0 (low noise) to 3.0 (high noise)
    const minGain = 1.0;
    const maxGain = 3.0;
    
    // Normalize noise level and apply gain curve
    const normalizedNoise = Math.min(noiseLevel * 10, 1.0);
    return minGain + (maxGain - minGain) * normalizedNoise;
  }

  /**
   * Convert spectrum back to time domain
   * 
   * Simplified inverse transform. For production, this would use proper IFFT.
   * 
   * @private
   * @param spectrum - Frequency-domain magnitude spectrum
   * @param outputData - Output buffer for time-domain samples
   */
  private spectrumToTimeDomain(spectrum: Float32Array, outputData: Float32Array): void {
    const samplesPerBand = Math.floor(outputData.length / spectrum.length);
    
    for (let band = 0; band < spectrum.length; band++) {
      const magnitude = spectrum[band];
      const start = band * samplesPerBand;
      const end = Math.min(start + samplesPerBand, outputData.length);
      
      // Simple reconstruction with band magnitude
      for (let i = start; i < end; i++) {
        // Apply magnitude with some phase preservation from original
        const phase = Math.sin((i / outputData.length) * Math.PI * 2 * band);
        outputData[i] = magnitude * phase * 0.5;
      }
    }
  }

  /**
   * Isolate and prioritize speech content from multi-source audio
   * 
   * Implements source separation to distinguish speech from background audio
   * when multiple audio sources are present. Uses frequency-domain analysis
   * to identify speech characteristics and apply selective amplification.
   * 
   * Requirements: 1.3 (Speech isolation for multi-source audio)
   * 
   * @param stream - The input media stream with multiple sources
   * @returns MediaStream - The processed stream with speech prioritized
   */
  isolateSpeech(stream: MediaStream): MediaStream {
    if (!this.audioContext) {
      console.warn('Audio context not initialized, returning original stream');
      return stream;
    }

    try {
      // Create a new destination for the processed audio
      const destination = this.audioContext.createMediaStreamDestination();
      
      // Create source from input stream
      const source = this.audioContext.createMediaStreamSource(stream);
      
      // Create script processor for custom audio processing
      const bufferSize = 4096;
      const scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
      
      scriptProcessor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        const outputData = event.outputBuffer.getChannelData(0);
        
        // Apply speech isolation and prioritization
        this.applySpeechSeparation(inputData, outputData);
      };
      
      // Connect the audio graph: source -> processor -> destination
      source.connect(scriptProcessor);
      scriptProcessor.connect(destination);
      
      return destination.stream;
    } catch (error) {
      console.error('Failed to apply speech isolation:', error);
      return stream; // Return original stream on error
    }
  }

  /**
   * Apply source separation to isolate speech from background audio
   * 
   * This method performs frequency-domain analysis to separate speech
   * from background audio sources and applies selective amplification.
   * 
   * Algorithm:
   * 1. Analyze spectrum to identify speech and background components
   * 2. Build speech and background profiles
   * 3. Apply frequency-selective filtering to prioritize speech
   * 4. Attenuate background audio outside speech frequency range
   * 
   * @private
   * @param inputData - Input audio samples with multiple sources
   * @param outputData - Output buffer for processed audio with isolated speech
   */
  private applySpeechSeparation(inputData: Float32Array, outputData: Float32Array): void {
    // Compute spectrum from input
    const spectrum = this.computeSpectrum(inputData);
    const sampleRate = this.audioContext?.sampleRate || 48000;
    
    // Identify speech and background components
    const { speechMask, backgroundMask } = this.separateSources(spectrum, sampleRate);
    
    // Apply source separation with speech prioritization
    const separatedSpectrum = new Float32Array(spectrum.length);
    
    for (let i = 0; i < spectrum.length; i++) {
      // Amplify speech components
      const speechComponent = spectrum[i] * speechMask[i] * this.SPEECH_PRIORITY_GAIN;
      
      // Attenuate background components
      const backgroundComponent = spectrum[i] * backgroundMask[i] * this.BACKGROUND_ATTENUATION;
      
      // Combine with speech prioritization
      separatedSpectrum[i] = speechComponent + backgroundComponent;
      
      // Prevent clipping
      separatedSpectrum[i] = Math.min(separatedSpectrum[i], 1.0);
    }
    
    // Convert back to time domain
    this.spectrumToTimeDomain(separatedSpectrum, outputData);
  }

  /**
   * Separate audio sources into speech and background components
   * 
   * Uses frequency-domain analysis to identify which spectral components
   * are likely speech versus background audio based on:
   * - Frequency range (speech is typically 85-3400 Hz)
   * - Temporal characteristics (speech has specific modulation patterns)
   * - Spectral shape (speech has formant structure)
   * 
   * @private
   * @param spectrum - Frequency-domain magnitude spectrum
   * @param sampleRate - Audio sample rate in Hz
   * @returns Object with speechMask and backgroundMask arrays
   */
  private separateSources(
    spectrum: Float32Array,
    sampleRate: number
  ): { speechMask: Float32Array; backgroundMask: Float32Array } {
    const numBands = spectrum.length;
    const speechMask = new Float32Array(numBands);
    const backgroundMask = new Float32Array(numBands);
    
    // Calculate frequency per band
    const freqPerBand = (sampleRate / 2) / numBands;
    
    for (let band = 0; band < numBands; band++) {
      const centerFreq = band * freqPerBand;
      
      // Determine if this band is in speech frequency range
      const inSpeechRange = centerFreq >= this.SPEECH_FREQ_MIN && 
                           centerFreq <= this.SPEECH_FREQ_MAX;
      
      if (inSpeechRange) {
        // Calculate speech likelihood based on spectral characteristics
        const speechLikelihood = this.calculateSpeechLikelihood(
          spectrum,
          band,
          centerFreq
        );
        
        speechMask[band] = speechLikelihood;
        backgroundMask[band] = 1.0 - speechLikelihood;
      } else {
        // Outside speech range - likely background audio
        speechMask[band] = 0.0;
        backgroundMask[band] = 1.0;
      }
    }
    
    // Apply temporal smoothing to masks
    this.smoothMask(speechMask);
    this.smoothMask(backgroundMask);
    
    return { speechMask, backgroundMask };
  }

  /**
   * Calculate likelihood that a frequency band contains speech
   * 
   * Analyzes spectral characteristics to determine if a frequency band
   * is likely to contain speech content versus background audio.
   * 
   * @private
   * @param spectrum - Full frequency spectrum
   * @param band - Current band index
   * @param centerFreq - Center frequency of the band in Hz
   * @returns number - Speech likelihood (0.0 to 1.0)
   */
  private calculateSpeechLikelihood(
    spectrum: Float32Array,
    band: number,
    centerFreq: number
  ): number {
    // Speech has characteristic energy distribution
    // Higher likelihood in formant frequency ranges (300-3000 Hz)
    let likelihood = 0.5; // Base likelihood
    
    // Boost likelihood for formant frequency ranges
    if (centerFreq >= 300 && centerFreq <= 3000) {
      likelihood += 0.3;
    }
    
    // Analyze local spectral shape
    // Speech typically has peaks (formants) with valleys between
    const hasFormantStructure = this.detectFormantStructure(spectrum, band);
    if (hasFormantStructure) {
      likelihood += 0.2;
    }
    
    // Check for harmonic structure (characteristic of voiced speech)
    const hasHarmonicStructure = this.detectHarmonicStructure(spectrum, band);
    if (hasHarmonicStructure) {
      likelihood += 0.2;
    }
    
    // Normalize to 0.0-1.0 range
    return Math.min(Math.max(likelihood, 0.0), 1.0);
  }

  /**
   * Detect formant structure in spectrum
   * 
   * Speech has characteristic formant peaks. This method looks for
   * local peaks in the spectrum that indicate formant structure.
   * 
   * @private
   * @param spectrum - Frequency spectrum
   * @param band - Current band index
   * @returns boolean - True if formant structure detected
   */
  private detectFormantStructure(spectrum: Float32Array, band: number): boolean {
    // Need at least 2 neighbors on each side
    if (band < 2 || band >= spectrum.length - 2) {
      return false;
    }
    
    const current = spectrum[band];
    const leftAvg = (spectrum[band - 2] + spectrum[band - 1]) / 2;
    const rightAvg = (spectrum[band + 1] + spectrum[band + 2]) / 2;
    
    // Check if current band is a local peak
    const isPeak = current > leftAvg * 1.2 && current > rightAvg * 1.2;
    
    return isPeak;
  }

  /**
   * Detect harmonic structure in spectrum
   * 
   * Voiced speech has harmonic structure with energy at multiples
   * of the fundamental frequency. This method looks for such patterns.
   * 
   * @private
   * @param spectrum - Frequency spectrum
   * @param band - Current band index
   * @returns boolean - True if harmonic structure detected
   */
  private detectHarmonicStructure(spectrum: Float32Array, band: number): boolean {
    // Look for energy at harmonic intervals
    // Simplified check: compare energy at current band with nearby bands
    if (band < 1 || band >= spectrum.length - 1) {
      return false;
    }
    
    const current = spectrum[band];
    const prev = spectrum[band - 1];
    const next = spectrum[band + 1];
    
    // Harmonic structure shows consistent energy across related frequencies
    const avgNeighbor = (prev + next) / 2;
    const ratio = current / (avgNeighbor + 0.001); // Avoid division by zero
    
    // Harmonics typically have similar energy levels (ratio close to 1.0)
    return ratio > 0.5 && ratio < 2.0;
  }

  /**
   * Apply temporal smoothing to a mask
   * 
   * Smooths the mask values to reduce artifacts and provide
   * more natural-sounding source separation.
   * 
   * @private
   * @param mask - Mask array to smooth (modified in place)
   */
  private smoothMask(mask: Float32Array): void {
    // Simple moving average smoothing
    const smoothed = new Float32Array(mask.length);
    const windowSize = 3;
    
    for (let i = 0; i < mask.length; i++) {
      let sum = 0;
      let count = 0;
      
      for (let j = -Math.floor(windowSize / 2); j <= Math.floor(windowSize / 2); j++) {
        const idx = i + j;
        if (idx >= 0 && idx < mask.length) {
          sum += mask[idx];
          count++;
        }
      }
      
      smoothed[i] = sum / count;
    }
    
    // Copy smoothed values back
    mask.set(smoothed);
  }

  /**
   * Detect if multiple audio sources are present
   * 
   * Analyzes the audio stream to determine if multiple distinct
   * audio sources are present (e.g., speech + background music).
   * 
   * @returns boolean - True if multiple sources detected
   */
  detectMultipleSources(): boolean {
    if (!this.analyserNode || !this.isCapturing) {
      return false;
    }

    const bufferLength = this.analyserNode.frequencyBinCount;
    const frequencyData = new Uint8Array(bufferLength);
    this.analyserNode.getByteFrequencyData(frequencyData);

    // Analyze spectral distribution
    const spectrum = new Float32Array(frequencyData.length);
    for (let i = 0; i < frequencyData.length; i++) {
      spectrum[i] = frequencyData[i] / 255.0;
    }

    // Calculate spectral spread - multiple sources have wider spread
    const spectralSpread = this.calculateSpectralSpread(spectrum);
    
    // Calculate energy distribution - multiple sources have energy in multiple bands
    const energyDistribution = this.calculateEnergyDistribution(spectrum);
    
    // Multiple sources typically have:
    // 1. High spectral spread (energy across wide frequency range)
    // 2. Multiple energy peaks (not concentrated in one area)
    const hasWideSpread = spectralSpread > 0.4;
    const hasMultiplePeaks = energyDistribution > 0.3;
    
    return hasWideSpread && hasMultiplePeaks;
  }

  /**
   * Calculate spectral spread
   * 
   * Measures how spread out the energy is across the frequency spectrum.
   * Higher values indicate energy distributed across many frequencies.
   * 
   * @private
   * @param spectrum - Frequency spectrum
   * @returns number - Spectral spread (0.0 to 1.0)
   */
  private calculateSpectralSpread(spectrum: Float32Array): number {
    // Calculate centroid first
    let weightedSum = 0;
    let sum = 0;
    
    for (let i = 0; i < spectrum.length; i++) {
      weightedSum += i * spectrum[i];
      sum += spectrum[i];
    }
    
    const centroid = sum > 0 ? weightedSum / sum : 0;
    
    // Calculate spread around centroid
    let spreadSum = 0;
    for (let i = 0; i < spectrum.length; i++) {
      const deviation = i - centroid;
      spreadSum += deviation * deviation * spectrum[i];
    }
    
    const spread = sum > 0 ? Math.sqrt(spreadSum / sum) : 0;
    
    // Normalize to 0-1 range
    return Math.min(spread / spectrum.length, 1.0);
  }

  /**
   * Calculate energy distribution across frequency bands
   * 
   * Measures how evenly energy is distributed across different
   * frequency bands. Multiple sources tend to have more even distribution.
   * 
   * @private
   * @param spectrum - Frequency spectrum
   * @returns number - Energy distribution metric (0.0 to 1.0)
   */
  private calculateEnergyDistribution(spectrum: Float32Array): number {
    // Divide spectrum into bands and calculate energy in each
    const numBands = 8;
    const bandSize = Math.floor(spectrum.length / numBands);
    const bandEnergies: number[] = [];
    
    for (let band = 0; band < numBands; band++) {
      let energy = 0;
      const start = band * bandSize;
      const end = Math.min(start + bandSize, spectrum.length);
      
      for (let i = start; i < end; i++) {
        energy += spectrum[i];
      }
      
      bandEnergies.push(energy);
    }
    
    // Calculate how many bands have significant energy
    const totalEnergy = bandEnergies.reduce((sum, e) => sum + e, 0);
    const threshold = totalEnergy / numBands * 0.3; // 30% of average
    const activeBands = bandEnergies.filter(e => e > threshold).length;
    
    // Normalize to 0-1 range
    return activeBands / numBands;
  }

  /**
   * Detect speech activity in the audio stream
   * 
   * Implements Voice Activity Detection (VAD) using energy-based detection
   * with spectral analysis and temporal smoothing.
   * 
   * The algorithm:
   * 1. Analyzes audio energy and spectral characteristics
   * 2. Compares against adaptive threshold
   * 3. Uses temporal smoothing to reduce false positives
   * 
   * Requirements: 1.2 (Audio quality assessment), 3.4 (Speech focus)
   * 
   * @param _stream - The media stream to analyze (unused - uses internal analyser)
   * @returns boolean - True if speech is detected, false otherwise
   */
  detectSpeechActivity(_stream: MediaStream): boolean {
    if (!this.analyserNode || !this.isCapturing) {
      return false;
    }

    // Get current audio data
    const bufferLength = this.analyserNode.fftSize;
    const timeDomainData = new Float32Array(bufferLength);
    const frequencyData = new Uint8Array(this.analyserNode.frequencyBinCount);
    
    this.analyserNode.getFloatTimeDomainData(timeDomainData);
    this.analyserNode.getByteFrequencyData(frequencyData);

    // Calculate energy-based features
    const energy = this.calculateEnergy(timeDomainData);
    const zeroCrossingRate = this.calculateZeroCrossingRate(timeDomainData);
    const spectralCentroid = this.calculateSpectralCentroid(frequencyData);

    // Voice activity decision based on multiple features
    const hasEnergy = energy > this.VAD_THRESHOLD;
    const hasVoiceCharacteristics = this.hasVoiceCharacteristics(
      zeroCrossingRate,
      spectralCentroid,
      energy
    );

    const currentVAD = hasEnergy && hasVoiceCharacteristics;

    // Apply temporal smoothing
    return this.smoothVADDecision(currentVAD);
  }

  /**
   * Calculate audio energy (RMS)
   * 
   * @private
   * @param audioData - Time-domain audio samples
   * @returns number - Energy level (0.0 to 1.0)
   */
  private calculateEnergy(audioData: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    return Math.sqrt(sum / audioData.length);
  }

  /**
   * Calculate zero-crossing rate
   * 
   * Zero-crossing rate is useful for distinguishing voiced speech
   * (low ZCR) from unvoiced speech and noise (high ZCR).
   * 
   * @private
   * @param audioData - Time-domain audio samples
   * @returns number - Zero-crossing rate (0.0 to 1.0)
   */
  private calculateZeroCrossingRate(audioData: Float32Array): number {
    let crossings = 0;
    for (let i = 1; i < audioData.length; i++) {
      if ((audioData[i] >= 0 && audioData[i - 1] < 0) ||
          (audioData[i] < 0 && audioData[i - 1] >= 0)) {
        crossings++;
      }
    }
    return crossings / audioData.length;
  }

  /**
   * Calculate spectral centroid
   * 
   * Spectral centroid indicates where the "center of mass" of the spectrum is.
   * Speech typically has a characteristic spectral centroid range.
   * 
   * @private
   * @param frequencyData - Frequency-domain magnitude data
   * @returns number - Spectral centroid (normalized 0.0 to 1.0)
   */
  private calculateSpectralCentroid(frequencyData: Uint8Array): number {
    let weightedSum = 0;
    let sum = 0;

    for (let i = 0; i < frequencyData.length; i++) {
      const magnitude = frequencyData[i] / 255.0; // Normalize to 0-1
      weightedSum += i * magnitude;
      sum += magnitude;
    }

    return sum > 0 ? weightedSum / (sum * frequencyData.length) : 0;
  }

  /**
   * Check if audio has voice characteristics
   * 
   * Uses heuristics based on typical speech features:
   * - Zero-crossing rate in speech range (not too high, not too low)
   * - Spectral centroid in speech range (300-3400 Hz typically)
   * - Sufficient energy
   * 
   * @private
   * @param zcr - Zero-crossing rate
   * @param spectralCentroid - Spectral centroid
   * @param energy - Audio energy
   * @returns boolean - True if characteristics match speech
   */
  private hasVoiceCharacteristics(
    zcr: number,
    spectralCentroid: number,
    energy: number
  ): boolean {
    // Speech typically has moderate zero-crossing rate (0.02 to 0.15)
    const zcrInRange = zcr > 0.02 && zcr < 0.15;

    // Speech spectral centroid typically in mid-range (0.2 to 0.6 normalized)
    const centroidInRange = spectralCentroid > 0.2 && spectralCentroid < 0.6;

    // Must have sufficient energy
    const sufficientEnergy = energy > this.VAD_THRESHOLD;

    // Require at least 2 out of 3 conditions for robustness
    const matchCount = [zcrInRange, centroidInRange, sufficientEnergy].filter(Boolean).length;
    return matchCount >= 2;
  }

  /**
   * Apply temporal smoothing to VAD decision
   * 
   * Uses a sliding window of recent VAD decisions to reduce
   * false positives and provide more stable detection.
   * 
   * @private
   * @param currentVAD - Current frame's VAD decision
   * @returns boolean - Smoothed VAD decision
   */
  private smoothVADDecision(currentVAD: boolean): boolean {
    // Add current decision to history
    this.vadHistory.push(currentVAD);

    // Keep only recent history
    if (this.vadHistory.length > this.VAD_HISTORY_LENGTH) {
      this.vadHistory.shift();
    }

    // Require majority of recent frames to indicate speech
    const speechFrames = this.vadHistory.filter(v => v).length;
    return speechFrames > this.VAD_HISTORY_LENGTH / 2;
  }

  /**
   * Get the current audio level (0.0 to 1.0)
   * 
   * Uses Web Audio API AnalyserNode to calculate RMS (Root Mean Square)
   * audio level for real-time audio monitoring.
   * 
   * @returns number - Audio level between 0.0 (silence) and 1.0 (maximum)
   */
  getAudioLevel(): number {
    if (!this.analyserNode || !this.isCapturing) {
      return 0;
    }

    const bufferLength = this.analyserNode.fftSize;
    const dataArray = new Float32Array(bufferLength);
    this.analyserNode.getFloatTimeDomainData(dataArray);

    // Calculate RMS (Root Mean Square) for audio level
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / bufferLength);

    return Math.min(rms, 1.0);
  }

  /**
   * Capture audio from the device microphone
   * 
   * @private
   * @returns Promise<MediaStream> - The microphone media stream
   */
  private async captureMicrophone(): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000, // High quality audio
        channelCount: 1 // Mono for speech
      },
      video: false
    };

    return await navigator.mediaDevices.getUserMedia(constraints);
  }

  /**
   * Capture audio from browser tab
   * 
   * Uses Chrome's tabCapture API for capturing tab-specific audio.
   * This requires the tabCapture permission in the extension manifest.
   * 
   * @private
   * @returns Promise<MediaStream> - The tab audio media stream
   */
  private async captureTabAudio(): Promise<MediaStream> {
    // Check if we're in a Chrome extension context
    if (typeof chrome !== 'undefined' && chrome.tabCapture) {
      return new Promise((resolve, reject) => {
        chrome.tabCapture.capture(
          {
            audio: true,
            video: false
          },
          (stream) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (stream) {
              resolve(stream);
            } else {
              reject(new Error('Failed to capture tab audio'));
            }
          }
        );
      });
    }

    // Fallback to getDisplayMedia for non-extension contexts
    return await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: false
    } as any);
  }

  /**
   * Capture system-wide audio
   * 
   * Uses getDisplayMedia API to capture system audio.
   * Note: This may require user interaction to select audio source.
   * 
   * @private
   * @returns Promise<MediaStream> - The system audio media stream
   */
  private async captureSystemAudio(): Promise<MediaStream> {
    return await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: false
    } as any);
  }

  /**
   * Initialize Web Audio API context for audio analysis
   * 
   * Sets up AudioContext, AnalyserNode, and connects the media stream
   * for real-time audio level detection.
   * 
   * @private
   * @param stream - The media stream to analyze
   */
  private initializeAudioContext(stream: MediaStream): void {
    try {
      // Create audio context
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      // Create analyser node for audio level detection
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.analyserNode.smoothingTimeConstant = 0.8;

      // Create source node from media stream
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);

      // Connect source to analyser
      this.sourceNode.connect(this.analyserNode);
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
      // Don't throw - audio level detection is optional
    }
  }

  /**
   * Clean up all resources
   * 
   * Stops all media tracks, disconnects audio nodes, and closes audio context
   * to prevent memory leaks.
   * 
   * @private
   */
  private cleanup(): void {
    // Stop monitoring
    this.stopAudioActivityMonitoring();

    // Stop all media tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    // Disconnect and clean up audio nodes
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close().catch(err => {
        console.error('Error closing audio context:', err);
      });
      this.audioContext = null;
    }

    // Reset noise reduction and VAD state
    this.noiseProfile = null;
    this.noiseEstimationFrames = 0;
    this.vadHistory = [];
    
    // Reset speech isolation state
    this.speechProfile = null;
    this.backgroundProfile = null;
  }

  /**
   * Get the current capture status
   * 
   * @returns boolean - True if currently capturing audio
   */
  isCurrentlyCapturing(): boolean {
    return this.isCapturing;
  }

  /**
   * Get the current audio source
   * 
   * @returns AudioSource | null - The current audio source or null if not capturing
   */
  getCurrentSource(): AudioSource | null {
    return this.currentSource;
  }

  /**
   * Get the current connection state
   * 
   * @returns 'connected' | 'interrupted' | 'disconnected' - The current connection state
   */
  getConnectionState(): 'connected' | 'interrupted' | 'disconnected' {
    return this.connectionState;
  }

  /**
   * Start monitoring audio activity for connection resilience
   * 
   * Monitors audio levels to detect when audio stops and starts.
   * When audio stops for more than 2 seconds, marks connection as interrupted
   * but maintains state for automatic resumption.
   * 
   * Requirements: 1.4 (Connection resilience and auto-resume)
   * 
   * @private
   */
  private startAudioActivityMonitoring(): void {
    // Clear any existing monitor
    this.stopAudioActivityMonitoring();

    // Start periodic audio activity check
    this.audioActivityMonitor = setInterval(() => {
      this.checkAudioActivity();
    }, this.AUDIO_ACTIVITY_CHECK_INTERVAL_MS);
  }

  /**
   * Stop monitoring audio activity
   * 
   * @private
   */
  private stopAudioActivityMonitoring(): void {
    if (this.audioActivityMonitor) {
      clearInterval(this.audioActivityMonitor);
      this.audioActivityMonitor = null;
    }

    if (this.silenceDetectionTimer) {
      clearTimeout(this.silenceDetectionTimer);
      this.silenceDetectionTimer = null;
    }
  }

  /**
   * Check for audio activity and manage connection state
   * 
   * This method is called periodically to:
   * 1. Detect if audio is present
   * 2. Track silence duration
   * 3. Mark connection as interrupted after 2 seconds of silence
   * 4. Automatically resume when audio returns
   * 
   * Requirements: 1.4 (Maintain connection and resume immediately)
   * 
   * @private
   */
  private checkAudioActivity(): void {
    if (!this.isCapturing || !this.analyserNode) {
      return;
    }

    const audioLevel = this.getAudioLevel();
    const hasAudio = audioLevel > this.VAD_THRESHOLD;

    if (hasAudio) {
      // Audio detected
      const now = Date.now();
      const wasInterrupted = this.connectionState === 'interrupted';

      this.lastAudioActivityTime = now;

      // Clear any pending silence detection
      if (this.silenceDetectionTimer) {
        clearTimeout(this.silenceDetectionTimer);
        this.silenceDetectionTimer = null;
      }

      // If we were interrupted, automatically resume
      if (wasInterrupted) {
        this.handleAudioResumption();
      } else if (this.connectionState === 'disconnected') {
        // Transition from disconnected to connected
        this.connectionState = 'connected';
        console.log('Audio connection established');
      }
    } else {
      // No audio detected
      const now = Date.now();
      const silenceDuration = now - this.lastAudioActivityTime;

      // If we've been silent for more than threshold and not already interrupted
      if (silenceDuration >= this.SILENCE_THRESHOLD_MS && this.connectionState === 'connected') {
        this.handleAudioInterruption();
      }
    }
  }

  /**
   * Handle audio interruption
   * 
   * Called when audio has been silent for more than 2 seconds.
   * Maintains connection state for automatic resumption.
   * 
   * Requirements: 1.4 (Maintain connection during interruption)
   * 
   * @private
   */
  private handleAudioInterruption(): void {
    console.log('Audio interruption detected - maintaining connection state');
    this.connectionState = 'interrupted';

    // Don't clean up resources - maintain connection for quick resume
    // Just mark the state change for monitoring and potential reconnection
  }

  /**
   * Handle audio resumption
   * 
   * Called when audio returns after an interruption.
   * Resumes processing immediately without requiring manual restart.
   * 
   * Requirements: 1.4 (Resume processing immediately upon audio resumption)
   * 
   * @private
   */
  private handleAudioResumption(): void {
    console.log('Audio resumed - restoring connection');
    this.connectionState = 'connected';
    this.reconnectionAttempts = 0;

    // Verify media stream is still active
    if (this.mediaStream) {
      const tracks = this.mediaStream.getTracks();
      const hasActiveTracks = tracks.some(track => track.readyState === 'live');

      if (!hasActiveTracks) {
        // Media stream is dead, attempt reconnection
        this.attemptReconnection();
      }
    }
  }

  /**
   * Attempt to reconnect the audio stream
   * 
   * If the media stream has been terminated, attempts to re-establish
   * the connection using the saved configuration.
   * 
   * Requirements: 1.4 (Automatic reconnection)
   * 
   * @private
   */
  private async attemptReconnection(): Promise<void> {
    if (!this.savedCaptureConfig || this.reconnectionAttempts >= this.MAX_RECONNECTION_ATTEMPTS) {
      console.error('Max reconnection attempts reached or no saved config');
      this.connectionState = 'disconnected';
      return;
    }

    this.reconnectionAttempts++;
    console.log(`Attempting reconnection (attempt ${this.reconnectionAttempts}/${this.MAX_RECONNECTION_ATTEMPTS})`);

    try {
      // Clean up old resources but preserve state
      const savedConfig = this.savedCaptureConfig;
      const wasCapturing = this.isCapturing;

      // Perform minimal cleanup
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
      }

      // Attempt to re-establish capture
      await this.startCapture(savedConfig.source);

      if (wasCapturing) {
        console.log('Reconnection successful');
      }
    } catch (error) {
      console.error('Reconnection failed:', error);
      
      // If we haven't exceeded max attempts, the monitoring will try again
      if (this.reconnectionAttempts >= this.MAX_RECONNECTION_ATTEMPTS) {
        this.connectionState = 'disconnected';
        console.error('Failed to reconnect after maximum attempts');
      }
    }
  }
}
