/**
 * WebSocket Client for Real-Time Transcription
 * 
 * Establishes WebSocket connection to API Gateway
 * Streams audio chunks and receives transcription results
 * Handles connection failures and reconnection
 * 
 * Requirements: 1.4, 12.4
 */

import { AudioChunk } from '../audio/AudioPreprocessor';

export interface TranscriptionResult {
  text: string;
  isFinal: boolean;
  confidence: number;
  timestamp: number;
}

export interface WebSocketMessage {
  action: string;
  data: any;
  timestamp: number;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private sessionId: string;
  private userId: string;
  private language: string;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000; // Start with 1 second
  private maxReconnectDelay: number = 30000; // Max 30 seconds
  private reconnectTimer: number | null = null;
  private messageQueue: WebSocketMessage[] = [];
  private maxQueueSize: number = 100;

  // Event handlers
  private onTranscriptionCallback: ((result: TranscriptionResult) => void) | null = null;
  private onErrorCallback: ((error: Error) => void) | null = null;
  private onConnectedCallback: (() => void) | null = null;
  private onDisconnectedCallback: (() => void) | null = null;

  constructor(wsUrl: string, userId: string, language: string = 'en') {
    this.wsUrl = wsUrl;
    this.userId = userId;
    this.language = language;
    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Establish WebSocket connection to API Gateway
   * Requirement: 1.4
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;

          // Send connect message
          this.sendMessage({
            action: 'connect',
            data: {
              userId: this.userId,
              language: this.language,
              sessionId: this.sessionId
            },
            timestamp: Date.now()
          });

          // Process queued messages
          this.processMessageQueue();

          if (this.onConnectedCallback) {
            this.onConnectedCallback();
          }

          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          const err = new Error('WebSocket connection error');
          if (this.onErrorCallback) {
            this.onErrorCallback(err);
          }
          reject(err);
        };

        this.ws.onclose = () => {
          console.log('WebSocket disconnected');
          this.isConnected = false;

          if (this.onDisconnectedCallback) {
            this.onDisconnectedCallback();
          }

          // Attempt reconnection
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stream audio chunk via WebSocket
   * Requirement: 1.4
   */
  streamAudioChunk(chunk: AudioChunk): void {
    if (!this.isConnected || !this.ws) {
      console.warn('WebSocket not connected, queueing message');
      this.queueMessage({
        action: 'transcribe',
        data: {
          audioChunk: this.arrayBufferToBase64(chunk.data),
          sessionId: this.sessionId,
          format: chunk.format,
          timestamp: chunk.timestamp
        },
        timestamp: Date.now()
      });
      return;
    }

    this.sendMessage({
      action: 'transcribe',
      data: {
        audioChunk: this.arrayBufferToBase64(chunk.data),
        sessionId: this.sessionId,
        format: chunk.format,
        timestamp: chunk.timestamp
      },
      timestamp: Date.now()
    });
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.messageQueue = [];
  }

  /**
   * Check if connected
   */
  isActive(): boolean {
    return this.isConnected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Set transcription result callback
   */
  onTranscription(callback: (result: TranscriptionResult) => void): void {
    this.onTranscriptionCallback = callback;
  }

  /**
   * Set error callback
   */
  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  /**
   * Set connected callback
   */
  onConnected(callback: () => void): void {
    this.onConnectedCallback = callback;
  }

  /**
   * Set disconnected callback
   */
  onDisconnected(callback: () => void): void {
    this.onDisconnectedCallback = callback;
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as WebSocketMessage;

      switch (message.action) {
        case 'result':
          this.handleTranscriptionResult(message.data);
          break;

        case 'error':
          this.handleError(message.data);
          break;

        case 'connected':
          console.log('Connection acknowledged by server');
          break;

        default:
          console.warn('Unknown message action:', message.action);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  /**
   * Handle transcription result
   */
  private handleTranscriptionResult(data: any): void {
    const result: TranscriptionResult = {
      text: data.text,
      isFinal: data.isFinal,
      confidence: data.confidence,
      timestamp: data.timestamp || Date.now()
    };

    if (this.onTranscriptionCallback) {
      this.onTranscriptionCallback(result);
    }
  }

  /**
   * Handle error message
   */
  private handleError(data: any): void {
    const error = new Error(data.message || 'Unknown error');
    console.error('Server error:', data);

    if (this.onErrorCallback) {
      this.onErrorCallback(error);
    }
  }

  /**
   * Send message via WebSocket
   */
  private sendMessage(message: WebSocketMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send message: WebSocket not open');
      this.queueMessage(message);
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send message:', error);
      this.queueMessage(message);
    }
  }

  /**
   * Queue message for later sending
   * Requirement: 12.4
   */
  private queueMessage(message: WebSocketMessage): void {
    if (this.messageQueue.length >= this.maxQueueSize) {
      console.warn('Message queue full, dropping oldest message');
      this.messageQueue.shift();
    }

    this.messageQueue.push(message);
  }

  /**
   * Process queued messages
   */
  private processMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift();
      if (message) {
        this.sendMessage(message);
      }
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   * Requirement: 12.4
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      if (this.onErrorCallback) {
        this.onErrorCallback(new Error('Failed to reconnect after maximum attempts'));
      }
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = window.setTimeout(() => {
      console.log('Reconnecting...');
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  /**
   * Convert ArrayBuffer to Base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.messageQueue.length;
  }
}
