/**
 * IndexedDB Cache for Avatar Assets
 * 
 * Caches avatar assets in IndexedDB for offline access
 * Preloads avatar assets during installation
 * 
 * Requirements: 3.8, 7.5
 */

export interface AvatarAsset {
  id: string;
  type: 'mesh' | 'texture' | 'animation' | 'metadata';
  data: ArrayBuffer | string;
  size: number;
  timestamp: number;
}

export class IndexedDBCache {
  private static readonly DB_NAME = 'accessibility-ai-cache';
  private static readonly DB_VERSION = 1;
  private static readonly AVATAR_STORE = 'avatar_assets';
  private db: IDBDatabase | null = null;

  /**
   * Initialize IndexedDB
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(IndexedDBCache.DB_NAME, IndexedDBCache.DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create avatar assets store
        if (!db.objectStoreNames.contains(IndexedDBCache.AVATAR_STORE)) {
          const store = db.createObjectStore(IndexedDBCache.AVATAR_STORE, { keyPath: 'id' });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  /**
   * Cache avatar asset in IndexedDB
   * Requirement: 7.5
   */
  async cacheAsset(asset: AvatarAsset): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([IndexedDBCache.AVATAR_STORE], 'readwrite');
      const store = transaction.objectStore(IndexedDBCache.AVATAR_STORE);

      const request = store.put(asset);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error('Failed to cache asset'));
      };
    });
  }

  /**
   * Retrieve avatar asset from cache
   * Requirement: 7.5
   */
  async getAsset(id: string): Promise<AvatarAsset | null> {
    if (!this.db) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([IndexedDBCache.AVATAR_STORE], 'readonly');
      const store = transaction.objectStore(IndexedDBCache.AVATAR_STORE);

      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(new Error('Failed to retrieve asset'));
      };
    });
  }

  /**
   * Get all assets of a specific type
   */
  async getAssetsByType(type: string): Promise<AvatarAsset[]> {
    if (!this.db) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([IndexedDBCache.AVATAR_STORE], 'readonly');
      const store = transaction.objectStore(IndexedDBCache.AVATAR_STORE);
      const index = store.index('type');

      const request = index.getAll(type);

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(new Error('Failed to retrieve assets by type'));
      };
    });
  }

  /**
   * Delete asset from cache
   */
  async deleteAsset(id: string): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([IndexedDBCache.AVATAR_STORE], 'readwrite');
      const store = transaction.objectStore(IndexedDBCache.AVATAR_STORE);

      const request = store.delete(id);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error('Failed to delete asset'));
      };
    });
  }

  /**
   * Clear all cached assets
   */
  async clearCache(): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([IndexedDBCache.AVATAR_STORE], 'readwrite');
      const store = transaction.objectStore(IndexedDBCache.AVATAR_STORE);

      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error('Failed to clear cache'));
      };
    });
  }

  /**
   * Get total cache size
   */
  async getCacheSize(): Promise<number> {
    if (!this.db) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([IndexedDBCache.AVATAR_STORE], 'readonly');
      const store = transaction.objectStore(IndexedDBCache.AVATAR_STORE);

      const request = store.getAll();

      request.onsuccess = () => {
        const assets = request.result as AvatarAsset[];
        const totalSize = assets.reduce((sum, asset) => sum + asset.size, 0);
        resolve(totalSize);
      };

      request.onerror = () => {
        reject(new Error('Failed to calculate cache size'));
      };
    });
  }

  /**
   * Preload avatar assets during installation
   * Requirement: 3.8
   */
  async preloadAvatarAssets(cdnBaseUrl: string, avatarIds: string[]): Promise<void> {
    console.log('Preloading avatar assets...');

    for (const avatarId of avatarIds) {
      try {
        // Load mesh
        await this.downloadAndCacheAsset(
          `${avatarId}-mesh`,
          'mesh',
          `${cdnBaseUrl}/avatars/${avatarId}/mesh.glb`
        );

        // Load metadata
        await this.downloadAndCacheAsset(
          `${avatarId}-metadata`,
          'metadata',
          `${cdnBaseUrl}/avatars/${avatarId}/metadata.json`
        );

        // Load textures (assuming standard texture names)
        const textureNames = ['diffuse', 'normal', 'specular'];
        for (const textureName of textureNames) {
          try {
            await this.downloadAndCacheAsset(
              `${avatarId}-texture-${textureName}`,
              'texture',
              `${cdnBaseUrl}/avatars/${avatarId}/textures/${textureName}.png`
            );
          } catch (error) {
            // Texture might not exist, continue
            console.warn(`Texture ${textureName} not found for ${avatarId}`);
          }
        }

        console.log(`Preloaded avatar: ${avatarId}`);
      } catch (error) {
        console.error(`Failed to preload avatar ${avatarId}:`, error);
      }
    }

    console.log('Avatar preloading complete');
  }

  /**
   * Download and cache a single asset
   */
  private async downloadAndCacheAsset(
    id: string,
    type: AvatarAsset['type'],
    url: string
  ): Promise<void> {
    // Check if already cached
    const existing = await this.getAsset(id);
    if (existing) {
      console.log(`Asset ${id} already cached`);
      return;
    }

    // Download asset
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download ${url}: ${response.status}`);
    }

    let data: ArrayBuffer | string;
    let size: number;

    if (type === 'metadata') {
      data = await response.text();
      size = new Blob([data]).size;
    } else {
      data = await response.arrayBuffer();
      size = data.byteLength;
    }

    // Cache asset
    await this.cacheAsset({
      id,
      type,
      data,
      size,
      timestamp: Date.now()
    });

    console.log(`Cached asset: ${id} (${size} bytes)`);
  }

  /**
   * Check if avatar is fully cached
   */
  async isAvatarCached(avatarId: string): Promise<boolean> {
    try {
      const mesh = await this.getAsset(`${avatarId}-mesh`);
      const metadata = await this.getAsset(`${avatarId}-metadata`);
      return mesh !== null && metadata !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get list of cached avatar IDs
   */
  async getCachedAvatarIds(): Promise<string[]> {
    if (!this.db) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([IndexedDBCache.AVATAR_STORE], 'readonly');
      const store = transaction.objectStore(IndexedDBCache.AVATAR_STORE);

      const request = store.getAll();

      request.onsuccess = () => {
        const assets = request.result as AvatarAsset[];
        const avatarIds = new Set<string>();

        assets.forEach(asset => {
          // Extract avatar ID from asset ID (format: avatarId-type)
          const match = asset.id.match(/^(.+)-(mesh|texture|animation|metadata)/);
          if (match) {
            avatarIds.add(match[1]);
          }
        });

        resolve(Array.from(avatarIds));
      };

      request.onerror = () => {
        reject(new Error('Failed to get cached avatar IDs'));
      };
    });
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
