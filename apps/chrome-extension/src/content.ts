/**
 * Content script for Chrome Extension
 * Injected into web pages to provide transcription overlay
 */

import { ExtensionController } from './ExtensionController';
import { AudioCapture } from './audio/AudioCapture';
import { AudioPreprocessor } from './audio/AudioPreprocessor';
import { WebSocketClient } from './websocket/WebSocketClient';
import { UIController } from './ui/UIController';
import { IndexedDBCache } from './storage/IndexedDBCache';
import { LatencyMonitor } from './monitoring/LatencyMonitor';

class ContentScript {
  private controller: ExtensionController | null = null;
  private isInitialized = false;

  async initialize() {
    if (this.isInitialized) return;

    try {
      // Initialize components
      const audioCapture = new AudioCapture();
      const audioPreprocessor = new AudioPreprocessor();
      const wsClient = new WebSocketClient('wss://your-api-gateway-url.com');
      const uiController = new UIController();
      const cache = new IndexedDBCache();
      const latencyMonitor = new LatencyMonitor();

      // Create extension controller
      this.controller = new ExtensionController(
        audioCapture,
        audioPreprocessor,
        wsClient,
        uiController,
        cache,
        latencyMonitor
      );

      await this.controller.initialize();
      this.isInitialized = true;

      console.log('Content script initialized');
    } catch (error) {
      console.error('Failed to initialize content script:', error);
    }
  }

  async start() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.controller) {
      await this.controller.start();
    }
  }

  stop() {
    if (this.controller) {
      this.controller.stop();
    }
  }

  cleanup() {
    if (this.controller) {
      this.controller.cleanup();
      this.controller = null;
      this.isInitialized = false;
    }
  }
}

// Create content script instance
const contentScript = new ContentScript();

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'INIT':
      contentScript.initialize().then(() => {
        sendResponse({ success: true });
      });
      return true;
    case 'START':
      contentScript.start().then(() => {
        sendResponse({ success: true });
      });
      return true;
    case 'STOP':
      contentScript.stop();
      sendResponse({ success: true });
      break;
    case 'CLEANUP':
      contentScript.cleanup();
      sendResponse({ success: true });
      break;
    default:
      console.warn('Unknown message type:', message.type);
  }
});

// Auto-initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    contentScript.initialize();
  });
} else {
  contentScript.initialize();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  contentScript.cleanup();
});

export {};
