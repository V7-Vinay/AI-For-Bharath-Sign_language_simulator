package com.accessibility.ai.cache

import android.content.Context
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

/**
 * Local cache for avatar assets with 50MB size limit
 */
class LocalCache(private val context: Context) {
    
    companion object {
        private const val CACHE_DIR = "avatar_cache"
        private const val MAX_CACHE_SIZE_BYTES = 50 * 1024 * 1024L // 50MB
    }
    
    private val cacheDir: File by lazy {
        File(context.cacheDir, CACHE_DIR).apply {
            if (!exists()) mkdirs()
        }
    }
    
    /**
     * Store avatar asset in cache
     */
    fun storeAsset(key: String, data: ByteArray): Boolean {
        // Check if adding this asset would exceed cache limit
        val currentSize = getCacheSize()
        if (currentSize + data.size > MAX_CACHE_SIZE_BYTES) {
            // Evict old assets using LRU
            evictLRU(data.size)
        }
        
        return try {
            val file = File(cacheDir, key)
            FileOutputStream(file).use { it.write(data) }
            
            // Update last accessed time
            file.setLastModified(System.currentTimeMillis())
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
    
    /**
     * Retrieve avatar asset from cache
     */
    fun getAsset(key: String): ByteArray? {
        return try {
            val file = File(cacheDir, key)
            if (!file.exists()) return null
            
            // Update last accessed time
            file.setLastModified(System.currentTimeMillis())
            
            FileInputStream(file).use { it.readBytes() }
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }
    
    /**
     * Check if asset exists in cache
     */
    fun hasAsset(key: String): Boolean {
        return File(cacheDir, key).exists()
    }
    
    /**
     * Remove asset from cache
     */
    fun removeAsset(key: String): Boolean {
        return File(cacheDir, key).delete()
    }
    
    /**
     * Get current cache size in bytes
     */
    fun getCacheSize(): Long {
        return cacheDir.listFiles()?.sumOf { it.length() } ?: 0L
    }
    
    /**
     * Get cache size in MB
     */
    fun getCacheSizeMB(): Double {
        return getCacheSize() / (1024.0 * 1024.0)
    }
    
    /**
     * Evict least recently used assets to free up space
     */
    private fun evictLRU(requiredSpace: Long) {
        val files = cacheDir.listFiles()?.sortedBy { it.lastModified() } ?: return
        
        var freedSpace = 0L
        for (file in files) {
            if (freedSpace >= requiredSpace) break
            
            freedSpace += file.length()
            file.delete()
        }
    }
    
    /**
     * Clear all cached assets
     */
    fun clearCache() {
        cacheDir.listFiles()?.forEach { it.delete() }
    }
    
    /**
     * Get list of cached asset keys
     */
    fun getCachedAssets(): List<String> {
        return cacheDir.listFiles()?.map { it.name } ?: emptyList()
    }
    
    /**
     * Preload avatar assets during app installation
     */
    suspend fun preloadAssets(assets: Map<String, ByteArray>) {
        for ((key, data) in assets) {
            storeAsset(key, data)
        }
    }
}
