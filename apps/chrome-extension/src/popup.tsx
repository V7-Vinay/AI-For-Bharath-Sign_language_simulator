/**
 * Popup UI for Chrome Extension
 * Provides settings and control interface
 */

import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

interface Preferences {
  language: string;
  signLanguage: string;
  avatarSkinTone: string;
  avatarClothing: string;
  avatarSize: string;
}

const Popup: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>({
    language: 'en',
    signLanguage: 'ASL',
    avatarSkinTone: 'medium',
    avatarClothing: 'casual',
    avatarSize: 'medium'
  });

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    chrome.runtime.sendMessage(
      { type: 'GET_PREFERENCES' },
      (response) => {
        if (response.success) {
          setPreferences(response.data);
        }
      }
    );
  };

  const savePreferences = async () => {
    chrome.runtime.sendMessage(
      { type: 'SAVE_PREFERENCES', data: preferences },
      (response) => {
        if (response.success) {
          alert('Preferences saved!');
        }
      }
    );
  };

  const handleStart = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'START' });
      setIsActive(true);
    }
  };

  const handleStop = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'STOP' });
      setIsActive(false);
    }
  };

  return (
    <div style={{ width: '300px', padding: '20px' }}>
      <h2>Accessibility AI</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={isActive ? handleStop : handleStart}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: isActive ? '#dc3545' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {isActive ? 'Stop' : 'Start'} Transcription
        </button>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>Language:</label>
        <select
          value={preferences.language}
          onChange={(e) => setPreferences({ ...preferences, language: e.target.value })}
          style={{ width: '100%', padding: '5px', marginTop: '5px' }}
        >
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
          <option value="zh">Mandarin</option>
        </select>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>Sign Language:</label>
        <select
          value={preferences.signLanguage}
          onChange={(e) => setPreferences({ ...preferences, signLanguage: e.target.value })}
          style={{ width: '100%', padding: '5px', marginTop: '5px' }}
        >
          <option value="ASL">ASL (American)</option>
          <option value="BSL">BSL (British)</option>
        </select>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>Avatar Skin Tone:</label>
        <select
          value={preferences.avatarSkinTone}
          onChange={(e) => setPreferences({ ...preferences, avatarSkinTone: e.target.value })}
          style={{ width: '100%', padding: '5px', marginTop: '5px' }}
        >
          <option value="light">Light</option>
          <option value="medium">Medium</option>
          <option value="dark">Dark</option>
        </select>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>Avatar Size:</label>
        <select
          value={preferences.avatarSize}
          onChange={(e) => setPreferences({ ...preferences, avatarSize: e.target.value })}
          style={{ width: '100%', padding: '5px', marginTop: '5px' }}
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </div>

      <button
        onClick={savePreferences}
        style={{
          width: '100%',
          padding: '10px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Save Settings
      </button>
    </div>
  );
};

// Mount the popup
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}

export default Popup;
