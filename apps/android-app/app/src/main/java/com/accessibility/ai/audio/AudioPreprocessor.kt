package com.accessibility.ai.audio

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import java.nio.ByteBuffer

/**
 * Audio Preprocessor for Android
 * Captures, compresses, and preprocesses audio for transcription
 */
class AudioPreprocessor {
    
    companion object {
        private const val SAMPLE_RATE = 16000 // 16kHz
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
        private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
        private const val CHUNK_DURATION_MS = 3000 // 3 seconds
        private const val SILENCE_THRESHOLD = -40 // dB
        private const val MAX_SILENCE_DURATION_MS = 2000 // 2 seconds
        private const val BITRATE = 24000 // 24 kbps
    }
    
    private var audioRecord: AudioRecord? = null
    private var isRecording = false
    private val bufferSize = AudioRecord.getMinBufferSize(
        SAMPLE_RATE,
        CHANNEL_CONFIG,
        AUDIO_FORMAT
    )
    
    /**
     * Capture audio from device microphone
     */
    fun captureAudio(): Flow<ByteArray> = flow {
        if (!checkPermissions()) {
            throw SecurityException("Microphone permission not granted")
        }
        
        audioRecord = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            SAMPLE_RATE,
            CHANNEL_CONFIG,
            AUDIO_FORMAT,
            bufferSize
        )
        
        audioRecord?.startRecording()
        isRecording = true
        
        val buffer = ByteArray(bufferSize)
        val chunkBuffer = mutableListOf<Byte>()
        val chunkSize = (SAMPLE_RATE * CHUNK_DURATION_MS / 1000) * 2 // 16-bit = 2 bytes
        
        while (isRecording) {
            val read = audioRecord?.read(buffer, 0, buffer.size) ?: 0
            
            if (read > 0) {
                chunkBuffer.addAll(buffer.take(read))
                
                // Emit chunk when buffer reaches chunk size
                if (chunkBuffer.size >= chunkSize) {
                    val chunk = chunkBuffer.take(chunkSize).toByteArray()
                    chunkBuffer.clear()
                    
                    // Preprocess chunk
                    val processed = preprocessChunk(chunk)
                    emit(processed)
                }
            }
        }
    }
    
    private fun preprocessChunk(chunk: ByteArray): ByteArray {
        // Trim silence
        val trimmed = trimSilence(chunk)
        
        // Compress audio
        val compressed = compressAudio(trimmed)
        
        return compressed
    }
    
    /**
     * Compress audio to 16kHz mono Opus at 24kbps
     */
    fun compressAudio(audioData: ByteArray): ByteArray {
        // Convert PCM to Opus using FFmpeg or native Opus encoder
        // This is a simplified implementation
        // In production, use actual Opus codec
        
        return audioData // Placeholder - implement actual Opus encoding
    }
    
    /**
     * Trim silence segments longer than 2 seconds
     */
    fun trimSilence(audioData: ByteArray): ByteArray {
        val samples = audioData.toShortArray()
        val result = mutableListOf<Short>()
        
        var silenceStart = -1
        var silenceDuration = 0
        
        for (i in samples.indices) {
            val amplitude = samples[i]
            val db = 20 * kotlin.math.log10(kotlin.math.abs(amplitude.toDouble()) / Short.MAX_VALUE)
            
            if (db < SILENCE_THRESHOLD) {
                if (silenceStart == -1) {
                    silenceStart = i
                }
                silenceDuration++
            } else {
                // Check if silence duration exceeded threshold
                val silenceDurationMs = (silenceDuration * 1000.0 / SAMPLE_RATE).toInt()
                
                if (silenceDurationMs > MAX_SILENCE_DURATION_MS && silenceStart != -1) {
                    // Skip this silence segment
                } else if (silenceStart != -1) {
                    // Add silence segment (within threshold)
                    for (j in silenceStart until i) {
                        result.add(samples[j])
                    }
                }
                
                result.add(amplitude)
                silenceStart = -1
                silenceDuration = 0
            }
        }
        
        return result.toShortArray().toByteArray()
    }
    
    /**
     * Buffer audio into 3-second chunks
     */
    fun bufferChunks(audioData: ByteArray): List<ByteArray> {
        val chunkSize = (SAMPLE_RATE * CHUNK_DURATION_MS / 1000) * 2
        val chunks = mutableListOf<ByteArray>()
        
        var offset = 0
        while (offset < audioData.size) {
            val end = minOf(offset + chunkSize, audioData.size)
            chunks.add(audioData.copyOfRange(offset, end))
            offset = end
        }
        
        return chunks
    }
    
    /**
     * Stop audio capture
     */
    fun stopCapture() {
        isRecording = false
        audioRecord?.stop()
        audioRecord?.release()
        audioRecord = null
    }
    
    /**
     * Check if microphone permission is granted
     */
    private fun checkPermissions(): Boolean {
        // Check android.permission.RECORD_AUDIO
        // This should be implemented with proper permission checking
        return true // Placeholder
    }
    
    /**
     * Get audio quality in dB
     */
    fun getAudioQuality(audioData: ByteArray): Double {
        val samples = audioData.toShortArray()
        val rms = kotlin.math.sqrt(samples.map { it.toDouble() * it.toDouble() }.average())
        return 20 * kotlin.math.log10(rms / Short.MAX_VALUE)
    }
}

// Extension functions
private fun ByteArray.toShortArray(): ShortArray {
    val shorts = ShortArray(size / 2)
    ByteBuffer.wrap(this).asShortBuffer().get(shorts)
    return shorts
}

private fun ShortArray.toByteArray(): ByteArray {
    val bytes = ByteArray(size * 2)
    val buffer = ByteBuffer.wrap(bytes)
    buffer.asShortBuffer().put(this)
    return bytes
}
