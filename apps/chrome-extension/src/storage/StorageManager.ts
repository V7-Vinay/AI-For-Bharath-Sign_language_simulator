/**
 * Storage Manager for Browser Extension
 * 
 * Manages user preferences using Chrome Storage API
 * Syncs with backend User Preferences Store
 * 
 * Requirements: 3.5, 9.4
 */

export interface UserPreferences {
  language: string;
  signLanguage: 'ASL' | 'BSL';
  avatarId: string;
  displaySettings: {
    fontSize: number;
    fontColor: string;
    backgroundColor: string;
    position: 'top' | 'bottom' | 'custom';
    customPosition?: { x: number; y: number };
  };
  offlineMode: boolean;
}

export class StorageManager {
  private static readonly PREFERENCES_KEY = 'user_preferences';
  private static readonly SYNC_INTERVAL = 5000; // 5 seconds (Requirement: 9.4)
  private syncTimer: number | null = null;
  private pendingSync: boolean = false;

  /**
   * Store user preferences locally using Chrome storage API
   * Requirement: 3.5
   */
  async storePreferences(preferences: UserPreferences): Promise<void> {
    try {
      await chrome.storage.local.set({
        [StorageManager.PREFERENCES_KEY]: preferences
      });

      // Mark for sync with backend
      this.pendingSync = true;
      this.scheduleSyncWithBackend(preferences);
    } catch (error) {
      console.error('Failed to store preferences:', error);
      throw new Error('Storage failed: ' + (error as Error).message);
    }
  }

  /**
   * Retrieve user preferences from local storage
   * Requirement: 3.5
   */
  async getPreferences(): Promise<UserPreferences | null> {
    try {
      const result = await chrome.storage.local.get(StorageManager.PREFERENCES_KEY);
      return result[StorageManager.PREFERENCES_KEY] || null;
    } catch (error) {
      console.error('Failed to retrieve preferences:', error);
      return null;
    }
  }

  /**
   * Update specific preference fields
   */
  async updatePreferences(updates: Partial<UserPreferences>): Promise<void> {
    const current = await this.getPreferences();
    if (!current) {
      throw new Error('No preferences found to update');
    }

    const updated = { ...current, ...updates };
    await this.storePreferences(updated);
  }

  /**
   * Sync preferences with backend User Preferences Store
   * Requirement: 9.4
   */
  async syncWithBackend(preferences: UserPreferences): Promise<void> {
    try {
      // Get API endpoint from environment or config
      const apiEndpoint = await this.getApiEndpoint();
      const userId = await this.getUserId();

      if (!apiEndpoint || !userId) {
        console.warn('Cannot sync: missing API endpoint or user ID');
        return;
      }

      const response = await fetch(`${apiEndpoint}/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': await this.getApiKey()
        },
        body: JSON.stringify({
          userId,
          preferences
        })
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status} ${response.statusText}`);
      }

      this.pendingSync = false;
      console.log('Preferences synced with backend successfully');
    } catch (error) {
      console.error('Failed to sync preferences with backend:', error);
      // Keep pendingSync true to retry later
    }
  }

  /**
   * Load preferences from backend
   */
  async loadFromBackend(): Promise<UserPreferences | null> {
    try {
      const apiEndpoint = await this.getApiEndpoint();
      const userId = await this.getUserId();

      if (!apiEndpoint || !userId) {
        console.warn('Cannot load: missing API endpoint or user ID');
        return null;
      }

      const response = await fetch(`${apiEndpoint}/preferences?userId=${userId}`, {
        method: 'GET',
        headers: {
          'x-api-key': await this.getApiKey()
        }
      });

      if (!response.ok) {
        throw new Error(`Load failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const preferences = data.preferences as UserPreferences;

      // Store locally
      await chrome.storage.local.set({
        [StorageManager.PREFERENCES_KEY]: preferences
      });

      return preferences;
    } catch (error) {
      console.error('Failed to load preferences from backend:', error);
      return null;
    }
  }

  /**
   * Clear all stored preferences
   */
  async clearPreferences(): Promise<void> {
    try {
      await chrome.storage.local.remove(StorageManager.PREFERENCES_KEY);
      this.pendingSync = false;
      if (this.syncTimer) {
        clearTimeout(this.syncTimer);
        this.syncTimer = null;
      }
    } catch (error) {
      console.error('Failed to clear preferences:', error);
    }
  }

  /**
   * Get default preferences
   */
  getDefaultPreferences(): UserPreferences {
    return {
      language: 'en',
      signLanguage: 'ASL',
      avatarId: 'avatar-1',
      displaySettings: {
        fontSize: 16,
        fontColor: '#FFFFFF',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        position: 'top'
      },
      offlineMode: false
    };
  }

  /**
   * Initialize preferences (load from backend or use defaults)
   */
  async initializePreferences(): Promise<UserPreferences> {
    // Try to load from local storage first
    let preferences = await this.getPreferences();

    if (preferences) {
      return preferences;
    }

    // Try to load from backend
    preferences = await this.loadFromBackend();

    if (preferences) {
      return preferences;
    }

    // Use defaults
    preferences = this.getDefaultPreferences();
    await this.storePreferences(preferences);

    return preferences;
  }

  /**
   * Schedule sync with backend (within 5 seconds)
   * Requirement: 9.4
   */
  private scheduleSyncWithBackend(preferences: UserPreferences): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }

    this.syncTimer = window.setTimeout(() => {
      if (this.pendingSync) {
        this.syncWithBackend(preferences);
      }
    }, StorageManager.SYNC_INTERVAL);
  }

  /**
   * Get API endpoint from storage
   */
  private async getApiEndpoint(): Promise<string | null> {
    try {
      const result = await chrome.storage.local.get('api_endpoint');
      return result.api_endpoint || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get user ID from storage
   */
  private async getUserId(): Promise<string | null> {
    try {
      const result = await chrome.storage.local.get('user_id');
      return result.user_id || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get API key from storage
   */
  private async getApiKey(): Promise<string> {
    try {
      const result = await chrome.storage.local.get('api_key');
      return result.api_key || '';
    } catch (error) {
      return '';
    }
  }

  /**
   * Set API configuration
   */
  async setApiConfig(endpoint: string, apiKey: string, userId: string): Promise<void> {
    await chrome.storage.local.set({
      api_endpoint: endpoint,
      api_key: apiKey,
      user_id: userId
    });
  }
}
