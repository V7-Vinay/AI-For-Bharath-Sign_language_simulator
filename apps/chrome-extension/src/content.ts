/**
 * Content script for Chrome Extension
 * Injected into web pages to capture audio and display transcriptions
 */

import { AudioCapture } from './audio/AudioCapture';
import { AudioPreprocessor } from './audio/AudioPreprocessor';
import { UIController } from './ui/UIController';
import { WebSocketClient } from './websocket/WebSocketClient';
import { LatencyMonitor } from './monitoring/LatencyMonitor';

class ContentScript {
  private audioCapture: AudioCapture | null = null;
  private audioPreprocessor: AudioPreprocessor | null = null;
  private uiController: UIController | null = null;
  private wsClient: WebSocketClient | null = null;
  private latencyMonitor: LatencyMonitor | null = null;
  private isActive: boolean = false;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    // Initialize UI controller
    this.uiController = new UIController();
    
    // Initialize latency monitor
    this.latencyMonitor = new LatencyMonitor();

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true;
    });

    console.log('Content script initialized');
  }

  private async handleMessage(request: any, sender: any, sendResponse: Function): Promise<void> {
    switch (request.type) {
      case 'START_CAPTURE':
        await this.startCapture();
        sendResponse({ success: true });
        break;
      
      case 'STOP_CAPTURE':
        this.stopCapture();
        sendResponse({ success: true });
        break;
      
      case 'SHOW_TRANSCRIPTION':
        this.uiController?.showTranscription(request.text);
        sendResponse({ success: true });
        break;
      
      case 'SHOW_AVATAR':
        this.uiController?.showAvatar(request.animation);
        sendResponse({ success: true });
        break;
      
      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  }

  private async startCapture(): Promise<void> {
    if (this.isActive) {
      console.warn('Capture already active');
      return;
    }

    try {
      // Initialize audio capture
      this.audioCapture = new AudioCapture();
      await this.audioCapture.initialize();

      // Initialize audio preprocessor
      this.audioPreprocessor = new AudioPreprocessor();

      // Initialize WebSocket client
      const apiEndpoint = 'wss://your-api-gateway-endpoint';
      this.wsClient = new WebSocketClient(apiEndpoint);
      await this.wsClient.connect();

      // Start capturing and processing audio
      this.audioCapture.startCapture((audioData) => {
        if (this.audioPreprocessor && this.wsClient) {
          const processed = this.audioPreprocessor.process(audioData);
          this.wsClient.sendAudio(processed);
        }
      });

      this.isActive = true;
      console.log('Audio capture started');
    } catch (error) {
      console.error('Failed to start capture:', error);
      throw error;
    }
  }

  private stopCapture(): void {
    if (!this.isActive) {
      return;
    }

    this.audioCapture?.stopCapture();
    this.wsClient?.disconnect();
    
    this.audioCapture = null;
    this.audioPreprocessor = null;
    this.wsClient = null;
    
    this.isActive = false;
    console.log('Audio capture stopped');
  }
}

// Initialize content script
new ContentScript();
