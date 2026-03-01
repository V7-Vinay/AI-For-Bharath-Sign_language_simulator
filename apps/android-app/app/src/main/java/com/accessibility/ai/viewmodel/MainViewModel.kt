package com.accessibility.ai.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.accessibility.ai.model.AnimationSequence
import com.accessibility.ai.model.Transcription
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class MainViewModel : ViewModel() {
    
    private val _transcriptionFlow = MutableSharedFlow<Transcription>()
    val transcriptionFlow: SharedFlow<Transcription> = _transcriptionFlow
    
    private val _animationFlow = MutableSharedFlow<AnimationSequence>()
    val animationFlow: SharedFlow<AnimationSequence> = _animationFlow
    
    private val _isRecording = MutableStateFlow(false)
    val isRecording: StateFlow<Boolean> = _isRecording
    
    private var isPaused = false
    
    fun startTranscription() {
        viewModelScope.launch {
            _isRecording.value = true
            // Start audio capture and transcription
        }
    }
    
    fun stopTranscription() {
        viewModelScope.launch {
            _isRecording.value = false
            // Stop audio capture
        }
    }
    
    fun pauseTranscription() {
        isPaused = true
        _isRecording.value = false
    }
    
    fun resumeTranscription() {
        if (isPaused) {
            isPaused = false
            _isRecording.value = true
        }
    }
    
    fun cleanup() {
        stopTranscription()
    }
}
