package com.accessibility.ai.session

import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Session Manager for handling app lifecycle and background/foreground transitions
 */
class SessionManager : DefaultLifecycleObserver {
    
    private val _sessionState = MutableStateFlow(SessionState.FOREGROUND)
    val sessionState: StateFlow<SessionState> = _sessionState
    
    private val _isTranscriptionActive = MutableStateFlow(false)
    val isTranscriptionActive: StateFlow<Boolean> = _isTranscriptionActive
    
    private var wasTranscribingBeforeBackground = false
    
    enum class SessionState {
        FOREGROUND,
        BACKGROUND,
        PAUSED
    }
    
    override fun onStart(owner: LifecycleOwner) {
        super.onStart(owner)
        _sessionState.value = SessionState.FOREGROUND
    }
    
    override fun onResume(owner: LifecycleOwner) {
        super.onResume(owner)
        _sessionState.value = SessionState.FOREGROUND
        
        // Resume transcription if it was active before backgrounding
        if (wasTranscribingBeforeBackground) {
            resumeTranscription()
        }
    }
    
    override fun onPause(owner: LifecycleOwner) {
        super.onPause(owner)
        _sessionState.value = SessionState.BACKGROUND
        
        // Save transcription state
        wasTranscribingBeforeBackground = _isTranscriptionActive.value
        
        // Pause transcription when app goes to background
        if (_isTranscriptionActive.value) {
            pauseTranscription()
        }
    }
    
    override fun onStop(owner: LifecycleOwner) {
        super.onStop(owner)
        _sessionState.value = SessionState.PAUSED
    }
    
    fun startTranscription() {
        _isTranscriptionActive.value = true
    }
    
    fun stopTranscription() {
        _isTranscriptionActive.value = false
        wasTranscribingBeforeBackground = false
    }
    
    private fun pauseTranscription() {
        // Pause transcription but keep state
        _isTranscriptionActive.value = false
    }
    
    private fun resumeTranscription() {
        // Resume transcription
        _isTranscriptionActive.value = true
    }
    
    fun isInForeground(): Boolean {
        return _sessionState.value == SessionState.FOREGROUND
    }
    
    fun isInBackground(): Boolean {
        return _sessionState.value == SessionState.BACKGROUND
    }
}
