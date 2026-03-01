/**
 * Background script for Chrome Extension
 * Handles extension lifecycle and background tasks
 */

import { WebSocketClient } from './websocket/WebSocketClient';
import { StorageManager } from './storage/StorageManager';

// Initialize storage manager
const storageManager = new StorageManager();

// Handle extension installation
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('Extension installed');
    
    // Set default preferences
    await storageManager.savePreferences({
      language: 'en',
      signLanguage: 'ASL',
      avatarSkinTone: 'medium',
      avatarClothing: 'casual',
      avatarSize: 'medium'
    });
    
    // Preload avatar assets
    await preloadAvatarAssets();
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'START_TRANSCRIPTION':
      handleStartTranscription(message.data);
      break;
    case 'STOP_TRANSCRIPTION':
      handleStopTranscription();
      break;
    case 'GET_PREFERENCES':
      handleGetPreferences(sendResponse);
      return true; // Keep channel open for async response
    case 'SAVE_PREFERENCES':
      handleSavePreferences(message.data, sendResponse);
      return true;
    default:
      console.warn('Unknown message type:', message.type);
  }
});

async function handleStartTranscription(data: any) {
  console.log('Starting transcription', data);
  // WebSocket connection will be managed by content script
}

function handleStopTranscription() {
  console.log('Stopping transcription');
}

async function handleGetPreferences(sendResponse: (response: any) => void) {
  const preferences = await storageManager.loadPreferences();
  sendResponse({ success: true, data: preferences });
}

async function handleSavePreferences(data: any, sendResponse: (response: any) => void) {
  await storageManager.savePreferences(data);
  sendResponse({ success: true });
}

async function preloadAvatarAssets() {
  // Preload avatar assets during installation
  console.log('Preloading avatar assets');
  // Implementation would fetch and cache avatar assets
}

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
  console.log('Extension started');
});

export {};
