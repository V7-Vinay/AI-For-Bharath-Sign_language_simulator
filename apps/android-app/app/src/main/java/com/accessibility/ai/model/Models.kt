package com.accessibility.ai.model

/**
 * Data models for the Android app
 */

data class Transcription(
    val text: String,
    val timestamp: String,
    val language: String,
    val confidence: Float = 1.0f
)

data class AnimationSequence(
    val frames: List<com.accessibility.ai.renderer.AnimationFrame>,
    val duration: Long,
    val fps: Int = 60
)

data class ApiResponse<T>(
    val success: Boolean,
    val data: T?,
    val error: String?
)
