/**
 * Background script for Chrome Extension
 * Handles extension lifecycle and background tasks
 */

import { WebSocketClient } from './websocket/WebSocketClient';
import { StorageManager } from './storage/StorageManager';

// Initialize storage manager
const storageManager = new StorageManager();

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Extension installed');
    // Initialize default settings
    storageManager.savePreferences({
      language: 'en',
      signLanguage: 'ASL',
      avatarCustomization: {
        skinTone: 'default',
        clothing: 'default',
        hairStyle: 'default'
      }
    });
  } else if (details.reason === 'update') {
    console.log('Extension updated');
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'START_TRANSCRIPTION') {
    // Start transcription service
    console.log('Starting transcription');
    sendResponse({ success: true });
  } else if (request.type === 'STOP_TRANSCRIPTION') {
    // Stop transcription service
    console.log('Stopping transcription');
    sendResponse({ success: true });
  } else if (request.type === 'GET_PREFERENCES') {
    // Get user preferences
    storageManager.loadPreferences().then(prefs => {
      sendResponse({ preferences: prefs });
    });
    return true; // Keep channel open for async response
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // Open extension popup or toggle transcription
  console.log('Extension icon clicked');
});

console.log('Background script loaded');
