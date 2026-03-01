package com.accessibility.ai.preferences

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Preferences Manager for local storage and backend sync
 */
data class UserPreferences(
    val language: String = "en",
    val signLanguage: String = "ASL",
    val avatarSkinTone: String = "medium",
    val avatarClothing: String = "casual",
    val avatarSize: String = "medium",
    val displayFontSize: Int = 16,
    val displayContrast: String = "normal",
    val offlineModeEnabled: Boolean = false,
    val autoSyncEnabled: Boolean = true
)

class PreferencesManager(context: Context) {
    
    private val sharedPreferences: SharedPreferences = context.getSharedPreferences(
        "accessibility_ai_prefs",
        Context.MODE_PRIVATE
    )
    
    private val _preferences = MutableStateFlow(loadPreferences())
    val preferences: StateFlow<UserPreferences> = _preferences
    
    private val _syncStatus = MutableStateFlow(SyncStatus.SYNCED)
    val syncStatus: StateFlow<SyncStatus> = _syncStatus
    
    enum class SyncStatus {
        SYNCED,
        PENDING,
        SYNCING,
        ERROR
    }
    
    /**
     * Load preferences from local storage
     */
    private fun loadPreferences(): UserPreferences {
        return UserPreferences(
            language = sharedPreferences.getString("language", "en") ?: "en",
            signLanguage = sharedPreferences.getString("sign_language", "ASL") ?: "ASL",
            avatarSkinTone = sharedPreferences.getString("avatar_skin_tone", "medium") ?: "medium",
            avatarClothing = sharedPreferences.getString("avatar_clothing", "casual") ?: "casual",
            avatarSize = sharedPreferences.getString("avatar_size", "medium") ?: "medium",
            displayFontSize = sharedPreferences.getInt("display_font_size", 16),
            displayContrast = sharedPreferences.getString("display_contrast", "normal") ?: "normal",
            offlineModeEnabled = sharedPreferences.getBoolean("offline_mode_enabled", false),
            autoSyncEnabled = sharedPreferences.getBoolean("auto_sync_enabled", true)
        )
    }
    
    /**
     * Save preferences to local storage
     */
    fun savePreferences(preferences: UserPreferences) {
        sharedPreferences.edit().apply {
            putString("language", preferences.language)
            putString("sign_language", preferences.signLanguage)
            putString("avatar_skin_tone", preferences.avatarSkinTone)
            putString("avatar_clothing", preferences.avatarClothing)
            putString("avatar_size", preferences.avatarSize)
            putInt("display_font_size", preferences.displayFontSize)
            putString("display_contrast", preferences.displayContrast)
            putBoolean("offline_mode_enabled", preferences.offlineModeEnabled)
            putBoolean("auto_sync_enabled", preferences.autoSyncEnabled)
            apply()
        }
        
        _preferences.value = preferences
        
        // Mark as pending sync if auto-sync is enabled
        if (preferences.autoSyncEnabled) {
            _syncStatus.value = SyncStatus.PENDING
        }
    }
    
    /**
     * Update specific preference
     */
    fun updateLanguage(language: String) {
        savePreferences(_preferences.value.copy(language = language))
    }
    
    fun updateSignLanguage(signLanguage: String) {
        savePreferences(_preferences.value.copy(signLanguage = signLanguage))
    }
    
    fun updateAvatarCustomization(skinTone: String, clothing: String, size: String) {
        savePreferences(_preferences.value.copy(
            avatarSkinTone = skinTone,
            avatarClothing = clothing,
            avatarSize = size
        ))
    }
    
    fun updateDisplaySettings(fontSize: Int, contrast: String) {
        savePreferences(_preferences.value.copy(
            displayFontSize = fontSize,
            displayContrast = contrast
        ))
    }
    
    fun updateOfflineMode(enabled: Boolean) {
        savePreferences(_preferences.value.copy(offlineModeEnabled = enabled))
    }
    
    /**
     * Sync preferences with backend
     */
    suspend fun syncWithBackend(
        onSync: suspend (UserPreferences) -> Boolean
    ) {
        if (_syncStatus.value == SyncStatus.SYNCING) return
        
        _syncStatus.value = SyncStatus.SYNCING
        
        try {
            val success = onSync(_preferences.value)
            _syncStatus.value = if (success) SyncStatus.SYNCED else SyncStatus.ERROR
        } catch (e: Exception) {
            e.printStackTrace()
            _syncStatus.value = SyncStatus.ERROR
        }
    }
    
    /**
     * Load preferences from backend
     */
    suspend fun loadFromBackend(
        onLoad: suspend () -> UserPreferences?
    ) {
        try {
            val backendPrefs = onLoad()
            if (backendPrefs != null) {
                savePreferences(backendPrefs)
                _syncStatus.value = SyncStatus.SYNCED
            }
        } catch (e: Exception) {
            e.printStackTrace()
            _syncStatus.value = SyncStatus.ERROR
        }
    }
    
    /**
     * Clear all preferences
     */
    fun clearPreferences() {
        sharedPreferences.edit().clear().apply()
        _preferences.value = UserPreferences()
    }
}
