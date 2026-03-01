/**
 * Popup UI for Chrome Extension
 * Provides user interface for controlling the extension
 */

import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

interface Preferences {
  language: string;
  signLanguage: string;
  avatarCustomization: {
    skinTone: string;
    clothing: string;
    hairStyle: string;
  };
}

const Popup: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [latency, setLatency] = useState<number>(0);

  useEffect(() => {
    // Load preferences
    chrome.runtime.sendMessage({ type: 'GET_PREFERENCES' }, (response) => {
      if (response && response.preferences) {
        setPreferences(response.preferences);
      }
    });
  }, []);

  const handleToggle = () => {
    if (isActive) {
      // Stop transcription
      chrome.runtime.sendMessage({ type: 'STOP_TRANSCRIPTION' }, (response) => {
        if (response.success) {
          setIsActive(false);
        }
      });
    } else {
      // Start transcription
      chrome.runtime.sendMessage({ type: 'START_TRANSCRIPTION' }, (response) => {
        if (response.success) {
          setIsActive(true);
        }
      });
    }
  };

  const handleLanguageChange = (language: string) => {
    if (preferences) {
      const updated = { ...preferences, language };
      setPreferences(updated);
      // Save to storage
      chrome.storage.local.set({ preferences: updated });
    }
  };

  const handleSignLanguageChange = (signLanguage: string) => {
    if (preferences) {
      const updated = { ...preferences, signLanguage };
      setPreferences(updated);
      // Save to storage
      chrome.storage.local.set({ preferences: updated });
    }
  };

  return (
    <div style={{ width: '300px', padding: '20px' }}>
      <h2>Accessibility AI</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={handleToggle}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: isActive ? '#dc3545' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          {isActive ? 'Stop' : 'Start'} Transcription
        </button>
      </div>

      {latency > 500 && (
        <div style={{ 
          padding: '10px', 
          backgroundColor: '#fff3cd', 
          borderRadius: '5px',
          marginBottom: '10px'
        }}>
          ⚠️ High latency detected: {latency}ms
        </div>
      )}

      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>
          Language:
        </label>
        <select 
          value={preferences?.language || 'en'}
          onChange={(e) => handleLanguageChange(e.target.value)}
          style={{ width: '100%', padding: '5px' }}
        >
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
          <option value="zh">Mandarin</option>
        </select>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>
          Sign Language:
        </label>
        <select 
          value={preferences?.signLanguage || 'ASL'}
          onChange={(e) => handleSignLanguageChange(e.target.value)}
          style={{ width: '100%', padding: '5px' }}
        >
          <option value="ASL">ASL (American)</option>
          <option value="BSL">BSL (British)</option>
        </select>
      </div>

      <div style={{ fontSize: '12px', color: '#666', marginTop: '20px' }}>
        <p>Status: {isActive ? 'Active' : 'Inactive'}</p>
        {latency > 0 && <p>Latency: {latency}ms</p>}
      </div>
    </div>
  );
};

// Mount the popup
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}
