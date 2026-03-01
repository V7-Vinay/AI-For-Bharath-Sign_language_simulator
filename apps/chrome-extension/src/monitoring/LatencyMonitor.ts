/**
 * Latency Monitor for Browser Extension
 * 
 * Monitors network latency and displays warnings
 * when latency exceeds 500ms
 * 
 * Requirements: 1.6
 */

export interface LatencyMetrics {
  current: number;
  average: number;
  min: number;
  max: number;
  samples: number;
}

export class LatencyMonitor {
  private static readonly LATENCY_THRESHOLD = 500; // 500ms (Requirement: 1.6)
  private static readonly SAMPLE_SIZE = 10;
  private static readonly PING_INTERVAL = 5000; // 5 seconds

  private latencySamples: number[] = [];
  private currentLatency: number = 0;
  private isMonitoring: boolean = false;
  private pingTimer: number | null = null;
  private apiEndpoint: string;
  private onWarningCallback: ((latency: number) => void) | null = null;
  private onNormalCallback: (() => void) | null = null;
  private isWarningActive: boolean = false;

  // Track request timestamps for latency calculation
  private pendingRequests: Map<string, number> = new Map();

  constructor(apiEndpoint: string) {
    this.apiEndpoint = apiEndpoint;
  }

  /**
   * Start monitoring network latency
   * Requirement: 1.6
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.schedulePing();
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    this.isMonitoring = false;

    if (this.pingTimer) {
      clearTimeout(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Record request start time
   */
  recordRequestStart(requestId: string): void {
    this.pendingRequests.set(requestId, Date.now());
  }

  /**
   * Record request completion and calculate latency
   */
  recordRequestComplete(requestId: string): number | null {
    const startTime = this.pendingRequests.get(requestId);
    if (!startTime) {
      return null;
    }

    const latency = Date.now() - startTime;
    this.pendingRequests.delete(requestId);

    this.addLatencySample(latency);
    return latency;
  }

  /**
   * Add latency sample and check threshold
   */
  private addLatencySample(latency: number): void {
    this.currentLatency = latency;

    // Add to samples
    this.latencySamples.push(latency);

    // Keep only last N samples
    if (this.latencySamples.length > LatencyMonitor.SAMPLE_SIZE) {
      this.latencySamples.shift();
    }

    // Check if latency exceeds threshold
    this.checkLatencyThreshold();
  }

  /**
   * Check if latency exceeds threshold and trigger warning
   * Requirement: 1.6
   */
  private checkLatencyThreshold(): void {
    const avgLatency = this.getAverageLatency();

    if (avgLatency > LatencyMonitor.LATENCY_THRESHOLD) {
      if (!this.isWarningActive) {
        this.isWarningActive = true;
        console.warn(`High latency detected: ${avgLatency}ms (threshold: ${LatencyMonitor.LATENCY_THRESHOLD}ms)`);

        if (this.onWarningCallback) {
          this.onWarningCallback(avgLatency);
        }
      }
    } else {
      if (this.isWarningActive) {
        this.isWarningActive = false;
        console.log('Latency returned to normal');

        if (this.onNormalCallback) {
          this.onNormalCallback();
        }
      }
    }
  }

  /**
   * Perform ping to measure latency
   */
  private async performPing(): Promise<void> {
    const requestId = `ping-${Date.now()}`;
    this.recordRequestStart(requestId);

    try {
      const response = await fetch(`${this.apiEndpoint}/health`, {
        method: 'GET',
        cache: 'no-cache'
      });

      if (response.ok) {
        this.recordRequestComplete(requestId);
      } else {
        console.warn('Ping failed:', response.status);
        this.pendingRequests.delete(requestId);
      }
    } catch (error) {
      console.error('Ping error:', error);
      this.pendingRequests.delete(requestId);
      // Add a high latency sample to indicate connection issues
      this.addLatencySample(5000);
    }
  }

  /**
   * Schedule next ping
   */
  private schedulePing(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.pingTimer = window.setTimeout(async () => {
      await this.performPing();
      this.schedulePing();
    }, LatencyMonitor.PING_INTERVAL);
  }

  /**
   * Get current latency
   */
  getCurrentLatency(): number {
    return this.currentLatency;
  }

  /**
   * Get average latency
   */
  getAverageLatency(): number {
    if (this.latencySamples.length === 0) {
      return 0;
    }

    const sum = this.latencySamples.reduce((acc, val) => acc + val, 0);
    return sum / this.latencySamples.length;
  }

  /**
   * Get latency metrics
   */
  getMetrics(): LatencyMetrics {
    if (this.latencySamples.length === 0) {
      return {
        current: 0,
        average: 0,
        min: 0,
        max: 0,
        samples: 0
      };
    }

    return {
      current: this.currentLatency,
      average: this.getAverageLatency(),
      min: Math.min(...this.latencySamples),
      max: Math.max(...this.latencySamples),
      samples: this.latencySamples.length
    };
  }

  /**
   * Check if latency is high
   */
  isLatencyHigh(): boolean {
    return this.isWarningActive;
  }

  /**
   * Set warning callback
   */
  onWarning(callback: (latency: number) => void): void {
    this.onWarningCallback = callback;
  }

  /**
   * Set normal callback
   */
  onNormal(callback: () => void): void {
    this.onNormalCallback = callback;
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.latencySamples = [];
    this.currentLatency = 0;
    this.isWarningActive = false;
    this.pendingRequests.clear();
  }

  /**
   * Get latency threshold
   */
  static getThreshold(): number {
    return LatencyMonitor.LATENCY_THRESHOLD;
  }
}
